# STATUS: Grocery Cart

_Branch `ccr-1f3a7259-ii7u86` · local tool (Node + Playwright over CDP) now, browser extension later_

Read this first, then `README.md`, `SETUP.md` (Phase 0 run), `LIST_FORMAT.md` and `DESIGN_BRIEF.md`.
Development follows `extensions/playlist-bridge`: phases with a feasibility gate first, `instruction.sh`, fixture-based
unit tests, a scripted e2e, and a Claude Design canvas in `design/` before UI work.

## Goal
Paste a grocery list → JioMart cart filled with the right products (pack size, brand, price), reviewed by you first.
No checkout, no payment, no logins handled by us: everything runs inside your own signed-in JioMart tab.

## Approach (decided)
- Attach to a Chrome started with `--remote-debugging-port` and its own `--user-data-dir` (Chrome 136+ refuses the
  port on the default profile). Sign in to JioMart there once.
- Prefer JioMart's own JSON requests, sent with `fetch()` from inside the JioMart tab (your cookies, JioMart's origin),
  over typing and clicking. Clicking stays as the fallback if Phase 0 shows the requests can't be replayed.
- Engine split: list parser → site adapter (search, addToCart) → matcher (+ pack maths) → review → add → remembered choices.
  Written in TypeScript so it moves into an extension later (as playlist-bridge's engine did).
- Human pace: one item at a time, pauses between adds; stop and hand over on a "verify you're human" check.

## Phases
| # | Phase | State |
|---|---|---|
| 0 | Feasibility: record a search + add by hand, summarise (redacted), replay the search with new words from the tab | ✅ search replay works on JioMart (even without its custom headers); endpoints mapped in `research/jiomart-api.md` |
| 0b | Add a product found by a new search, check, remove (`cart-probe`); learn whether the `x-fp-signature` is checked | 🔧 built, tested on a JioMart-shaped stand-in; **waiting for a real run** |
| 1 | List parser + units, tests (format in LIST_FORMAT.md, sample `examples/my-list.txt`) | format decided |
| 2 | JioMart adapter: search + add via its requests, click fallback; fixtures from Phase 0 | |
| 3 | Matcher: name/brand tokens, pack size and pack maths, stock, price per unit, confidence | |
| 4 | Local web page: paste, live search, review, add, report (design from Claude Design) | brief ready |
| 5 | Remembered choices | |
| 6 | DMart Ready adapter; extension (side panel) | brief covers the extension |

## Phase 0 tools (`src/research/`)
- `record.ts`: guided recording; `recorder.ts` keeps document/fetch/XHR/ping requests to `*.jiomart.com` in full and
  any other request carrying the search term (search can be a third-party service); other hosts by URL only.
  Page loads are kept because results may be server-rendered into the HTML.
- `summarize.ts` → `summary.md`: steps, ranked search candidates (term in URL/body; +5 if the added product's name is
  in the response, with its JSON path), cart candidates (writes during add/+/remove), all shop requests per step, other hosts.
  `shape.ts` outlines JSON (also `__NEXT_DATA__` / JSON script blocks in HTML); `redact.ts` drops header values,
  sensitive keys and personal-looking values.
- `cart-probe.ts` + `jiomart.ts` (Phase 0b, JioMart only): builds the search/add/remove requests from scratch
  (request builders and response readers Phase 2 will reuse), adds 1 of the first sellable product, checks the
  cart, removes it, checks again; tries the add without the signature headers first. Refuses if the product is
  already in the cart, and asks before writing.
- `probe.ts`: replays the top search candidate with new words in the JioMart tab, with and without the page's custom
  headers, and guesses the product list (biggest array of objects with a name field). `--add` replays the captured
  add-to-cart once, after typing `yes`.
- `tests/e2e/fake-jiomart.ts`: JioMart-shaped endpoints for the cart probe, optionally enforcing the signature.
- `tests/e2e/phase0.e2e.ts` + `fake-shop.ts`: a stand-in shop needing a session cookie and a custom header; checks
  recording per step, the ranking, the redaction (token, cookie, phone, name, e-mail, address, pincode), both search
  replays, the add replay, and that disconnecting leaves your Chrome and tabs open.

## Findings so far
Details and field tables: `research/jiomart-api.md`.
- JioMart's storefront is Fynd's platform. Search is `GET /ext/vertex/application/api/v1.0/products?f=…&q=…`; it
  returns JSON with everything matching needs (uid, name, brand, pack size, price, MRP, per-kg price, stock, order
  limit, category, images, other pack sizes). Replaying it from the tab with new words works, with or without the
  page's custom headers.
- Add to cart is `POST /api/service/application/cart/v2.0/bulk-detail?id=<cart>` with a list of items; remove and
  quantity changes are `PUT /api/service/application/cart/v2.0/detail?id=<cart>`. Failures are HTTP 200 with
  `success: false`.
- Open: is `x-fp-signature` checked on cart writes (if so, the tool must get the page to sign, or click instead);
  is `item_size` always `sizes[0]` from search; what `f` holds; can one bulk-detail call add the whole basket.
- The first summary leaked an `area_code` (pincode) in a URL and a store's coordinates; redaction now covers
  `area_code`, 6-digit query values and location keys (including arrays like `long_lat`).
- `probe --add` replayed a `remove_item` sent just before the add (harmless: "Failed to remove", cart unchanged).
  The add pick now prefers writes whose response says "added".
- `www.jiomart.com` is reachable from the cloud container, but recording from there was refused by the session's
  safety checks (a headless browser posing as a normal one). All live runs happen in the user's Chrome.

## Next steps
1. You: `./instruction.sh summarize` (regenerates the summary with the fixed redaction), then
   `./instruction.sh cart-probe "toor dal"` and share the new lines at the end of `probe.md`.
2. Me: if the add works without the signature, Phase 2 uses requests; if only with a fresh signature, find how the
   page signs (Fynd SDK in the page) or fall back to clicking. Then Phase 1 (parser) and Phase 2 (adapter, fixtures).
3. Paste `DESIGN_BRIEF.md`'s prompt into Claude Design; save the canvas in `design/`.

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
| 0b | Add a product found by a new search, check, remove (`cart-probe`); learn whether the `x-fp-signature` is checked | ✅ add + remove work from the tab; the signature isn't needed |
| 1 | List parser + units (`src/engine/list.ts`, `units.ts`) | ✅ reads all 65 lines of `examples/my-list.txt`; per-line errors |
| 2 | JioMart client (`src/engine/jiomart/`) + tab connection (`src/local/jiomart-tab.ts`); Quick and Shop all | 🔧 built; unit + e2e on a JioMart-shaped stand-in pass; **waiting for `live-check` on the real site** |
| 3 | Matcher: name/brand tokens, pack size and pack maths, stock, price per unit, confidence | |
| 4 | Local web page: paste, live search, review, add, report (design from Claude Design) | brief ready |
| 5 | Remembered choices | |
| 6 | DMart Ready adapter; extension (side panel) | brief covers the extension |

## Engine (`src/engine/`, no browser code: the extension will reuse it)
- `list.ts` / `units.ts`: the list format; quantities are a count (`x6`, `6 pcs`) or an amount (`5 kg`; g/kg/ml/L
  and spellings like gm, ltr). 1 kg ≈ 1 L.
- `jiomart/api.ts`: request builders and response readers: `Product` (uid, name, brand, size code, pack amount or
  pieces, price, MRP, per-unit label, sellable, min/max qty, categories, image, journey, variants), `Cart`/`CartLine`
  (identifier, article id, quantity, stock, journey, vertical), add / update / remove bodies, search URL.
- `jiomart/client.ts`: `JioMartClient(fetcher, session)`: `search(query, mode, limit)` with paging, `cart()`,
  `add`, `setQuantity`, `remove`. Writes are paced (1.5 s apart, searches 0.7 s). JioMart's answers become
  `ShopError` (`signed_out`, `human_check`, `rate_limited`, `shop_changed`, `mode_unknown`, `network`) or `CartError`
  (`out_of_stock`, `qty_limit`, `not_in_cart`, `shop_error`), as named in DESIGN_BRIEF.md.
- **Modes:** `quick` = JioMart Quick (`f=journey:quickcommerce:::store_ids:<store>||<store>`); `all` = Shop all.
  Each mode uses the filter *and headers* the page itself used for its last search in that mode, so the tool follows
  whatever JioMart does. Shop all's exact form is unconfirmed; an unfiltered search is assumed when the page sends no `f`.

## Local (`src/local/`, Playwright over CDP)
- `jiomart-tab.ts`: finds the JioMart tab, learns headers (minus the stale `x-fp-signature`/`x-fp-date`) and the
  cart query from the page's own polling (reloads once if the page is quiet), and each mode's filter from the page's
  searches; remembers filters per area code in `~/.config/grocery-cart/jiomart.json`. Requests go out with fetch()
  inside the tab.
- `live-check.ts`: you search once in Quick and once in Shop all on JioMart; it reports what it learnt (names only for
  headers, cookies, storage keys that change between modes), searches groceries and kitchenware in both modes,
  checks paging; `--cart` adds, changes to 2 and removes one product per mode (asks first).

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
- Cart writes work from the tab without the request signature (cart probe ✅ add, check, remove). Decision: Phase 2
  sends JioMart's own requests; clicking is not needed.
- Open: search's `f` limits results to quick delivery from one nearby store; kitchenware may only exist with
  standard delivery. Can one bulk-detail call add the whole basket.
- The first summary leaked an `area_code` (pincode) in a URL and a store's coordinates; redaction now covers
  `area_code`, 6-digit query values and location keys (including arrays like `long_lat`).
- `probe --add` replayed a `remove_item` sent just before the add (harmless: "Failed to remove", cart unchanged).
  The add pick now prefers writes whose response says "added".
- `www.jiomart.com` is reachable from the cloud container, but recording from there was refused by the session's
  safety checks (a headless browser posing as a normal one). All live runs happen in the user's Chrome.

## Next steps
1. You: `./instruction.sh live-check --cart` and share `captures/live-check-*.md`. It settles Shop all (filter,
   headers, cookies), whether kitchenware needs it, paging, and update/remove in both modes.
2. Me: fix what it shows, then Phase 3: matcher (name/brand/category tokens, loose vs packed, pack maths for
   amounts like 5 kg, stock and order limits, confidence) with fixtures from real searches.
3. Paste `DESIGN_BRIEF.md`'s prompt into Claude Design (updated for Quick / Shop all); save the canvas in `design/`.

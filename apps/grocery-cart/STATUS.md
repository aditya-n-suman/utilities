# STATUS: Grocery Cart

_Branch `ccr-1f3a7259-ii7u86` · local tool (Node + Playwright over CDP) now, browser extension later_

Read this first, then `README.md`, `SETUP.md` (runs and checks), `LIST_FORMAT.md` and `DESIGN_BRIEF.md`.
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
| 2 | JioMart client (`src/engine/jiomart/`) + tab connection (`src/local/jiomart-tab.ts`); Quick and Shop all | ✅ live check: both modes learnt and searched, adds work; paging and quantity changes open (below) |
| 3 | Matcher (`src/engine/match.ts`) | ✅ v1, unit-tested on cases from the real data; **tune on real searches** |
| 4 | Local app: server (`src/local/server.ts`, `app.ts`) + React UI (`src/ui/`) from `design/Grocery Cart.dc.html` | ✅ all of Part A, light + dark; UI e2e on the stand-in passes; **not yet run against the real site** |
| 5 | Remembered choices (`src/engine/remembered.ts`, A7) | ✅ kept in `~/.config/grocery-cart/remembered.json`; Change (search + pick) and Forget |
| 5b | Cart page (`#cart`) + "Undo this run" (`src/engine/tidy.ts`) | ✅ select lines (all / added by Grocery Cart / Quick / Scheduled) and remove them one by one; Undo restores what was there before |
| 6 | DMart Ready adapter; extension (side panel) | brief covers the extension |

## Run it
```bash
./instruction.sh chrome     # the tool's Chrome; sign in to JioMart there (once)
./instruction.sh start      # builds the UI, serves http://127.0.0.1:4180 and opens it
./instruction.sh test       # unit tests + typecheck
./instruction.sh e2e        # research tools, engine and UI against local stand-in shops (no network)
```
`SHOTS=<dir> npx tsx tests/e2e/ui.e2e.ts` saves screenshots of every screen (light and dark) for design checks.

## UI (`src/ui/`, design: `design/Grocery Cart.dc.html`, Part A)
- `App.tsx` picks the screen from the run's phase: Connect (A1) → Paste list (A2) → Finding (A3) → Review (A4) →
  Adding (A5) → Done (A6); Remembered choices (A7) at `#remembered`. State arrives over SSE (`/api/events`); actions are
  POSTs (`api.ts`). The list preview runs the engine's own parser in the browser.
- Tokens and layouts follow the design (`styles.css`): same colours (light and dark via `prefers-color-scheme`),
  Schibsted Grotesk / Geist Mono / Noto Sans Devanagari bundled with @fontsource (no Google Fonts call), 1280 px down to 900.
- Additions for Quick / Shop all (not in the canvas, which predates them): a delivery choice on Paste list, a 4th
  Connect row ("Learnt Quick and Shop all"), a delivery tag on each product, "Search Shop all for this" on Quick rows
  that found nothing, and a footer split ("5 Quick · 1 Shop all").
- Other differences from the canvas: Connect shows the pincode without the area name (JioMart's area name isn't read
  yet); A7's Change opens an inline search (words + Quick / Shop all) under the row instead of a dialog; "Pincode not
  serviceable" (A8.3) isn't detected; the A8 errors appear as the pause banner on the screen you're on, and "Nothing
  found" / "Your list is empty" in place. Extra links: "Stop and edit list", "Edit list", "Back to review", "New list".
- Cart page (`#cart`, `screens/CartScreen.tsx`): not in the canvas, built from its patterns (Remembered's head, Review's
  tabs and footer, Adding's progress and pause banner). Removing asks for confirmation in the footer; Done offers
  "Undo this run" (also confirmed). Requested because JioMart's cart page reloads after every change.
- Server (`src/local/server.ts`): 127.0.0.1 only; refuses other Host headers (DNS rebinding) and cross-site POSTs.

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
- `match.ts`: per line, scores each result by word coverage (with a shop synonym table: toor/tur/arhar, jeera/cumin,
  …), pack fit (an amount is best met by one pack of that size; over-buying costs; a size in the name is checked
  against each piece), and penalties for unsellable, "loose" (unless asked) and order limits (packs are capped);
  JioMart's order breaks ties. Confidence: high / medium / low / none. Returns the chosen candidate (packs, covers
  text, line total, price per kg/L) and up to 5 alternatives. A remembered product wins when it's in the results.
- `run.ts`: one run of a list: `find` (line by line), review edits (`choose`, `setPacks`, `skip`, `setRemember`,
  `searchAgain` with other words or the other mode), `addAll` (existing cart lines are increased, not duplicated;
  `onlyFailed` for retries), `pause`/`resume`, `reset`. Shop trouble pauses on the current line and resume retries it;
  a refused write fails only that line, except "out of stock" for several packs, which adds 1 ("only 1 of N"). Remembers a changed pick (if ticked) when it's added.
- `tidy.ts`: `CartTidy.run(targets)` brings each product down to a quantity (0 = remove), one at a time, re-reading the
  cart before each change because JioMart renumbers lines; pauses on shop trouble like the run. `Run.undoTargets()`
  gives "Undo this run": what the run added goes back to the quantity the cart had before (`Row.before`).
- `remembered.ts`: the remembered-choice record and store interface (local: JSON file; extension: chrome.storage).
- **Modes:** `quick` = JioMart Quick (`f=journey:quickcommerce:::store_ids:<store>||<store>`); `all` = Shop all.
  Each mode uses the filter *and headers* the page itself used for its last search in that mode, so the tool follows
  whatever JioMart does. Shop all's exact form is unconfirmed; an unfiltered search is assumed when the page sends no `f`.

## Local (`src/local/`, Playwright over CDP)
- `jiomart-tab.ts`: finds the JioMart tab, learns headers (minus the stale `x-fp-signature`/`x-fp-date`) and the
  cart query from the page's own polling (reloads once if the page is quiet), and each mode's filter from the page's
  searches; remembers filters per area code in `~/.config/grocery-cart/jiomart.json`. When you scroll a search, it
  learns paging from the page's page-2 request (`jiomart-paging.json`); until then a repeated page stops paging. When you
  add something on JioMart, it learns what the page's add carries in that mode (`jiomart-add.json`), which the client
  merges into its own adds (`AddTemplate`). The tool's own requests (also made in the tab) are ignored by the learning. Requests go out with fetch()
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
1. You: `./instruction.sh live-check --cart` again. In each mode it asks you to search, scroll, and add + remove any
   product on JioMart: that teaches paging and how the page adds in Shop all. The report shows what was learnt (field
   names only). Then the app with `examples/my-list.txt`.
2. Unverified on the real site, in `src/engine/jiomart/api.ts`: the sign-in check (`PROFILE_PATH`), the cart page
   (`CART_PAGE_PATH = /checkout/cart`).
3. Confirm paging from step 1's output; tune the matcher on real searches (sanitised fixtures + cases in `match.test.ts`).
4. Needs real JioMart responses first: the area name on Connect, pincode serviceability (A8.3).
5. Then the extension (Part B of the canvas), once the local app has worked on the real site: the engine
   (`src/engine/`) moves as is; `src/local/jiomart-tab.ts` becomes a content script + side panel.

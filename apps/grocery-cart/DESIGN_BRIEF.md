# Design brief: "Grocery Cart"

This is the prompt for Claude Design, plus the data the UI will receive. Designs should only show data that exists below.
One canvas, two parts: **A** is the local web app we build first, **B** is the browser extension planned for later.
They share the flow and components, so design A first and derive B from it.

## Prompt
> Design "Grocery Cart", a personal tool that turns a typed grocery list into a filled JioMart cart. It never checks out or pays: it stops at a full cart, which the user checks and pays for on JioMart themselves. Light and dark modes. It belongs to the same family as our "Playlist Bridge" app: warm off-white / near-black neutrals, Schibsted Grotesk for text, Geist Mono for numbers and quantities, calm and minimal. Give it its own accent: a fresh leaf green with a turmeric-yellow secondary. Don't use JioMart's logo, colours or name styling; refer to it as plain text "JioMart". Lists mix English and Hindi (Devanagari), so the type must render Devanagari well (Noto Sans Devanagari fallback), and long product names must wrap cleanly. Prices are in rupees with Indian digit grouping (₹1,23,456). Keyboard navigation and screen-reader labels throughout; a 70-item list must stay smooth to scroll.
>
> **The flow (same in both parts):** connect → paste list → find products (live) → review → add to cart (live) → done.
>
> **Part A: local web app** (desktop browser, 1280 px wide, responsive down to 900 px). It runs on the user's computer at `localhost` and drives a separate Chrome window where the user is signed in to JioMart.
> 1. **Connect:** a checklist card with four rows, each with a state (waiting, ok, problem): "Chrome is open for Grocery Cart" (when not, show the command `./instruction.sh chrome` with a Copy button), "Signed in to JioMart" (when not, an "Open JioMart sign-in" button), and "Delivering to 560001, Bengaluru" with the pincode as JioMart shows it ("Change on JioMart" link), and "Learnt Quick and Shop all" (when a mode is missing: "On JioMart, switch to Shop all and search for anything once"; this is needed once per pincode). A "Continue" button enables when the first three are ok; a missing mode only disables that option in the next step.
> 2. **Paste list:** a delivery choice above the textarea, as a two-option segmented control: **Quick** ("from a nearby store, delivered fast; groceries mostly") and **Shop all** ("JioMart's full range, scheduled delivery; needed for most kitchenware"). Remember the last choice. Then a large monospace textarea with a one-line format hint (`what to buy ; how much ; note`, e.g. `Atta ; 5 kg ; आटा`) and a "Format help" popover with the rules. A live preview beside it shows how each line was read: name, quantity chip ("x6" or "5 kg"), the note in muted text, and an inline error for lines it can't read ("Line 14: unknown unit 'pkt'"). Footer: "65 items" and a "Find products" button. A secondary "Load last list" link.
> 3. **Finding (live):** a progress bar, "23 / 65 searched", and the review table filling in as results arrive (rows show a skeleton until their result lands). Searching goes one item at a time at a human pace, so say "about 2 minutes".
> 4. **Review:** filter tabs with counts: All, Needs a look, Not found, Ready, Skipped. Each row:
>    - Left: the user's line: name, quantity chip, note (Hindi).
>    - Middle: the chosen product: image, name, brand, pack size, price with struck-through MRP, "Out of stock" if so, and how the quantity is met ("2 × 2.5 kg = 5 kg", "x6"), plus the line total.
>    - A small delivery chip on the chosen product (Quick or Shop all). In Quick mode, a "Not found" row offers "Search Shop all for this" inline, and a row can be switched to Shop all on its own.
>    - Right: a confidence chip (Good match, Check this, Not found), a small "Remembered" badge when the choice came from a past list, and actions: change product (a dropdown of up to 5 alternatives with image, pack, price and price per kg/L, sorted by best match), search JioMart by hand (a search field inside the row), change the pack count (stepper), skip.
>    - When a product is changed by hand, a checkbox "Remember for next time" (on by default).
>    A sticky footer: "58 items to add · estimated ₹6,240" (split as "51 Quick · 7 Shop all" when mixed, with a note that JioMart delivers them separately), a note "Prices are JioMart's, as of this search", and the primary button "Add 58 items to JioMart cart".
> 5. **Adding (live):** the same rows, each showing a state: waiting, adding, added ✓, or failed with a reason (out of stock now, quantity limit reached, JioMart error). It adds one at a time with a short pause; show "Adding 12 / 58" and a Pause button. If JioMart asks the user to prove they're human, pause and show a prominent card: "JioMart wants to check you're human. Finish the check in the Chrome window, then click Resume."
> 6. **Done:** "56 of 58 added" with "Open cart in Chrome" (primary) and "Retry 2 failed". A summary list of not-found and failed items with "Copy as text", so they can be bought elsewhere.
> 7. **Remembered choices:** a page reachable from the header: a searchable table of "your words → product" (image, name, pack, last price, last used date) with Change and Forget actions.
> 8. **Errors and empty states:** Chrome not reachable (with the command again); signed out of JioMart mid-way (pause, sign in, Resume); pincode not serviceable; "JioMart changed something, search isn't working" (with "Report a problem"); empty list; a list where nothing was found.
>
> **Part B: browser extension (later)**: the same flow in Chrome's side panel next to the JioMart tab (360–420 px wide, full height), so there is no separate Chrome window and no Connect step beyond "Open JioMart" when the active tab isn't JioMart. Header: name, a shop switcher showing "JioMart" (active) and "DMart Ready" (disabled, "coming later"), and a menu (Remembered choices, Help, Report a problem). Re-flow the review rows for the narrow width: the user's line on top, the chosen product below with a compact chip row, actions behind a "Change" button that expands inline. Sticky footer with the total and the Add button. Also design: the toolbar popup (one button, "Open Grocery Cart", plus the last list's status), the Remembered choices page as a full browser tab (reuse Part A's page), and a first-run screen that explains it only works on your own signed-in JioMart tab and never checks out.
>
> Show the main states for each screen with realistic data: a 65-item list mixing groceries (Atta 5 kg, Masoor dal 2 kg, Jeera 100 g, Mustard oil 5 L) and kitchenware (Pressure cooker 5 L, Container 1 kg x6, Tea strainer), Hindi notes, a few "Check this" rows (wrong pack size, only a 1 kg pack for a 5 kg need), two "Not found", one out of stock.

## Data available to the UI

**List item** (from parsing one line):
```json
{ "line": 14, "raw": "Atta ; 5 kg ; आटा", "query": "Atta",
  "qty": { "kind": "amount", "value": 5, "unit": "kg" }, "note": "आटा" }
```
`qty.kind` is `count` (`{ "kind": "count", "value": 6 }`) or `amount` (`value` + `unit`: `g | kg | ml | L`). Parse errors:
`{ "line": 14, "raw": "…", "error": "unknown unit 'pkt'" }`.

**Product** (one JioMart search result):
```json
{ "id": "590001234", "name": "Aashirvaad Shudh Chakki Atta 5 kg", "brand": "Aashirvaad",
  "pack": { "value": 5, "unit": "kg", "text": "5 kg" }, "price": 289, "mrp": 330,
  "image": "https://…", "url": "https://www.jiomart.com/p/…", "inStock": true, "maxQty": 4,
  "mode": "quick" }
```
`pack` can be missing (some products don't state it), `mrp` can equal `price`, and `maxQty` can be absent.
`mode` is the delivery it was found in: `quick | all`.

**Match** (one per list item, sent again on every change):
```json
{ "line": 14, "status": "matched", "confidence": "high", "remembered": false,
  "chosen": { "product": { /* Product */ }, "packs": 1, "covers": "1 × 5 kg = 5 kg", "lineTotal": 289 },
  "alternatives": [ /* up to 5 Products, best first, each with "pricePerUnit": { "value": 57.8, "per": "kg" } */ ],
  "cart": { "state": "waiting", "error": null } }
```
- `status`: `pending | matched | not_found | skipped`.
- `confidence`: `high | medium | low | none` (shown as Good match, Check this, Check this, Not found).
- `cart.state`: `waiting | adding | added | failed`; `cart.error`: `out_of_stock | qty_limit | shop_error | null`.

**Counts:** `{ total, searched, high, medium, low, not_found, skipped, added, failed, estimatedTotal }`

**Connection:** `{ chrome: "ok" | "unreachable", signedIn: true, pincode: "560001", area: "Bengaluru", serviceable: true, modes: { quick: true, all: false } }`

**List run:** `{ mode: "quick" | "all" }` for the whole list; a row can override it.

**Remembered choice:** `{ "query": "atta", "product": { /* Product */ }, "lastPrice": 289, "lastUsed": "2026-10-27" }`

**Errors** (`code`): `chrome_unreachable`, `signed_out`, `not_serviceable`, `human_check`, `rate_limited`, `shop_changed`, `mode_unknown`, `empty_list`, `nothing_found`.

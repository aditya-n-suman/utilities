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
| 0 | Feasibility: record a search + add by hand, summarise (redacted), replay the search with new words from the tab | 🔧 tools done and tested against a stand-in shop; **waiting for a real JioMart run** (SETUP.md) |
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
- `probe.ts`: replays the top search candidate with new words in the JioMart tab, with and without the page's custom
  headers, and guesses the product list (biggest array of objects with a name field). `--add` replays the captured
  add-to-cart once, after typing `yes`.
- `tests/e2e/phase0.e2e.ts` + `fake-shop.ts`: a stand-in shop needing a session cookie and a custom header; checks
  recording per step, the ranking, the redaction (token, cookie, phone, name, e-mail, address, pincode), both search
  replays, the add replay, and that disconnecting leaves your Chrome and tabs open.

## Findings so far
- `www.jiomart.com` is reachable from this cloud container (HTTP 200), but a recording from here was refused by the
  session's safety checks (a headless browser posing as a normal one counts as getting around bot checks). Phase 0
  runs in your own Chrome, as planned.
- No public or documented JioMart cart API exists; only paid scraping services for product data.

## Next steps
1. You: run Phase 0 (SETUP.md) and share `summary.md` + `probe.md`.
2. Me: read them and decide between replaying requests and clicking; save sanitised search responses as fixtures.
3. Paste `DESIGN_BRIEF.md`'s prompt into Claude Design; save the canvas in `design/`.
4. Phase 1 parser against `examples/my-list.txt`.

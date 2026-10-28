# Grocery Cart

Turn a grocery list into a filled JioMart cart, in your own signed-in Chrome. Paste the list, review the products it
picks (pack sizes, brands, prices), and it adds them to your cart. It never checks out or pays: you check the cart
and pay on JioMart yourself. DMart Ready may follow.

**State: usable end to end on a stand-in shop** (local app built from the Claude Design canvas: list → find → review →
add, Quick and Shop all, remembered choices). The first real-site runs are next. See [STATUS.md](STATUS.md).

```bash
cd apps/grocery-cart
./instruction.sh setup
./instruction.sh chrome     # the tool's own Chrome window: sign in to JioMart there once, set your pincode
./instruction.sh start      # opens http://127.0.0.1:4180
```

## How it will work
```
list (text)  →  parse  →  search JioMart  →  pick best product per line  →  review (local web page)  →  add to cart
                                  ↑ all of it runs inside your signed-in JioMart tab, through Chrome's DevTools port
```
- Runs on your computer only. It attaches to a Chrome you start with `./instruction.sh chrome` (its own profile).
- It uses JioMart's own requests from inside the JioMart tab, so it has your session and pincode without handling
  logins, and it goes at a human pace (one item at a time).
- You choose **Quick** (nearby store, fast) or **Shop all** (JioMart's full range, scheduled delivery) for the list,
  and can switch single items.
- It remembers what you picked for each line, so next month's list needs little review.
- Later, the same engine moves into a browser extension (side panel next to the JioMart tab), like `extensions/playlist-bridge`.

## Docs
- [LIST_FORMAT.md](LIST_FORMAT.md): the list format, and a Gemini prompt that converts your usual list into it.
- [SETUP.md](SETUP.md): install, using the app, the research runs on Fedora, troubleshooting.
- [DESIGN_BRIEF.md](DESIGN_BRIEF.md): the Claude Design prompt (local app now, extension later) and the UI's data.
  The resulting canvas is `design/Grocery Cart.dc.html`.
- [STATUS.md](STATUS.md): phases, findings, decisions, next steps.
- [research/jiomart-api.md](research/jiomart-api.md): JioMart's search and cart requests, from the Phase 0 run.

## Privacy
Everything stays on your computer. Raw captures (`captures/*/raw.jsonl`) hold your JioMart cookies and are git-ignored;
only the redacted `summary.md` and `probe.md` are meant to be shared. Automating a shop may be against its terms of
use; this tool is for your own cart, at a human pace.

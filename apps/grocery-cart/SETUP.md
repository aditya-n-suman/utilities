# Setup and Phase 0 run (Fedora + Chrome)

## Once
```bash
cd apps/grocery-cart
./instruction.sh setup        # npm install (.npmrc sets legacy-peer-deps, same npm 10 bug as playlist-bridge)
./instruction.sh test         # unit tests + typecheck
./instruction.sh e2e          # the Phase 0 tools against a local stand-in shop (needs Chrome or Chromium)
```
`e2e` uses `/usr/bin/google-chrome` if it finds no Chromium; set `CHROMIUM_EXECUTABLE=/path/to/chrome` to choose one.

## Use the app
```bash
./instruction.sh chrome     # leave this Chrome open; sign in to JioMart in it and set your pincode (once)
./instruction.sh start      # builds the UI and opens http://127.0.0.1:4180 in your normal browser
```
1. **Connect** checks the tool's Chrome, your JioMart sign-in and pincode. The first time per pincode it also asks you
   to search once on JioMart in **Quick** and once in **Shop all**: that's how it learns both.
2. **Paste** your list (see LIST_FORMAT.md), pick Quick or Shop all, **Find products**. It searches one line at a time.
3. **Review**: Change (alternatives), Search (other words), Skip, − / + packs. Quick lines that found nothing offer
   "Search Shop all for this". A changed pick is remembered for next time unless you untick it.
4. **Add**: one line at a time. If JioMart asks you to prove you're human, or signs you out, it pauses: fix it in the
   Chrome window, then Resume.
5. **Done**: open the cart in Chrome, retry failures, copy what to buy elsewhere.

It never checks out or pays. Files: `~/.config/grocery-cart/` (last list, remembered choices, learnt filters).

## Phase 0: record JioMart (about 15 minutes)
The goal is to learn what JioMart's own page sends when you search and add to the cart, and whether our tool can send
the same requests from your signed-in tab. You do the clicking; the tools only watch and then replay one search.

1. **Start the tool's Chrome.**
   ```bash
   ./instruction.sh chrome
   ```
   This opens Chrome with its own profile (`~/.config/grocery-cart-chrome`) and the DevTools port on 127.0.0.1:9222.
   Chrome 136+ won't open that port for your normal profile, so this is a separate one: your usual Chrome is untouched.
   It finds `google-chrome-stable` (the Google RPM) or the Flatpak `com.google.Chrome`; set `CHROME=/path` otherwise.
   While it runs, any program on your computer could control that window, so close it when you're done.

2. **Sign in to JioMart in that window** and set your delivery pincode. It stays signed in next time.

3. **Record.**
   ```bash
   ./instruction.sh record
   ```
   It prompts you through 7 steps: search for a word you type (e.g. `atta`), scroll, type the exact name of one product,
   add it, press + once, open the cart, remove it. Do each step in Chrome, then press Enter in the terminal.
   It writes `captures/jiomart-<time>/`:
   - `summary.md`: redacted (no header values, cookies, tokens, phone numbers, e-mails, addresses or names). Skim it,
     then share it (paste it in the chat or commit it under `research/`).
   - `raw.jsonl`: **has your cookies and tokens. Never share or commit it** (`captures/` is git-ignored).

4. **Probe the search** (read-only):
   ```bash
   ./instruction.sh probe --query "toor dal"
   ```
   It sends the captured search request again, with your new words, from the JioMart tab (once with the page's custom
   headers and once without), and prints the product names it got back. The output is appended to `probe.md` in the
   capture folder. Share that too.

5. **Optional: probe the add-to-cart.**
   ```bash
   ./instruction.sh probe --add
   ```
   After you type `yes`, it sends the captured add-to-cart once. Your real cart changes: reload the cart page to
   check, then remove the item.

6. **Phase 0b: add and remove a product found by a new search.**
   ```bash
   ./instruction.sh summarize                 # regenerate summary.md with the latest redaction
   ./instruction.sh cart-probe "toor dal"
   ```
   It searches, picks the first product JioMart will sell, reads your cart, and after you type `yes` adds 1 of it,
   checks the cart, removes it and checks again. It refuses if that product is already in your cart. Share the new
   lines at the end of `probe.md`. If it ends with "remove … by hand", do that on the cart page.

7. **Phase 2: live check of the JioMart client (Quick and Shop all).**
   ```bash
   ./instruction.sh live-check --cart      # leave out --cart for a read-only run
   ```
   It asks you to search once in "Quick" and once in "Shop all" on JioMart (that's how it learns both), then searches
   a few list lines in both modes. With `--cart`, for each mode it asks before adding 1 of a product, changes it to 2
   and removes it. Share `captures/live-check-<time>.md` (redacted: header, cookie and storage *names* only).

8. Close the tool's Chrome.

### If something goes wrong
| Symptom | Cause / fix |
|---|---|
| `Can't reach Chrome at http://127.0.0.1:9222` | Start it with `./instruction.sh chrome` and keep it open |
| `Chrome started but port 9222 isn't answering` | That profile is already open in another Chrome window. Close it and retry |
| `summary.md` says "No recorded request carried …" | The search ran before you pressed Enter, or JioMart renders results into the page. Record again; share the summary anyway (the request list helps) |
| JioMart shows a "verify you're human" page | Finish it by hand in the window, then carry on. Mention it when you share the summary: it matters for the design |
| Port 9222 is taken | `GROCERY_CHROME_PORT=9333 ./instruction.sh chrome` and the same variable for `start`; pass `--endpoint http://127.0.0.1:9333` to record/probe |
| Port 4180 is taken | `GROCERY_UI_PORT=4181 ./instruction.sh start` |
| Connect says signed out while you are signed in | The sign-in check endpoint is a guess (STATUS.md → Next steps); tell me |

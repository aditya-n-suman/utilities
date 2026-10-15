# Setup, checks and releasing

## Develop
```bash
cd extensions/playlist-bridge
./instruction.sh setup        # npm install (.npmrc sets legacy-peer-deps; npm 10 bug with WXT's optional vitest peer)
./instruction.sh test         # unit tests + typecheck (offline, fixture-based)
./instruction.sh dev          # Chrome with the extension loaded and hot reload
./instruction.sh dev firefox  # same in Firefox
```
`dev` opens its own browser profile, so sign in to YouTube there if you want to test Save.

## Automated end-to-end (Chromium, live sites)
```bash
pip install playwright        # plus `playwright install chromium`, or set CHROMIUM_EXECUTABLE
./instruction.sh e2e
```
This converts the 150-track "All Out 80s" playlist. It then reviews (swap, search, remove), reloads and resumes,
checks the links (50/50/49), the CSV and the signed-out save card, runs the missing playlist → paste fallback, and
clicks the button on the Spotify page. It needs network access and takes about a minute.

## Manual checks (signed-in save is not automated)
Do these in **both Chrome and Firefox**, with the build loaded and signed in to youtube.com in that browser:
1. Convert a playlist. On the result screen the save card shows your avatar and name.
2. **Save** as Private. The card ends with "Saved" and Open on YouTube / YouTube Music links. Open them and check the
   videos and their order.
3. Do the same with a playlist of more than 50 tracks. That covers the batched adds.
4. Leave the result screen open and sign out of YouTube in another tab. Within a couple of seconds the card should
   switch to "Sign in to YouTube…" without a click. Sign back in and it should show your account again. Clicking Save
   while signed out should say to sign in again.
5. On a Spotify playlist page, check that the "Convert to YouTube" button sits next to the action bar's ⋯, and that the
   right-click menu works on a playlist link.
6. On YouTube Music, open the Lyrics tab of a non-English song (for example Urdu or Hindi), then:
   - **Translate:** in Chrome the first use asks to download the model. Lines then show their English under them.
   - **Transliterate:** it asks to allow Google online, then shows Latin letters. Check a romanised Hindi song too: it
     should show Devanagari.
   - Skip to the next song. The bar keeps the mode and redoes the lyrics.
   - Click **Off**: YouTube's own lyrics come back.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| "Allow access" screen keeps coming back | A site permission was removed. Re-allow it from the screen, or in `chrome://extensions` → Details → Site access / Firefox `about:addons` → Permissions |
| YouTube search errors (403) | The Origin/Referer rule isn't applied. Check `declarativeNetRequest` is enabled for the extension and that the YouTube sites are allowed |
| "Spotify changed something" | The automatic hash recovery failed. Report a problem; until it's fixed, paste the track list instead |
| Save says not signed in while you are | The account is probably a brand account or not account #0 (`X-Goog-AuthUser: 0`) |
| Firefox: "This add-on could not be installed because it has not been verified" | Release Firefox needs a signed build. See Install in README |

## Release
Releases are GitHub releases tagged `playlist-bridge-v<version>`. Installed copies look for that tag prefix
(`src/platform/updates.ts`) and offer the update, so keep the prefix and plain `x.y.z` versions.

1. Bump `version` in `package.json`, and commit it to `master`.
2. Run `./instruction.sh test`, `./instruction.sh lint` and `./instruction.sh e2e`, then do the manual checks above.
3. Either run **playlist-bridge release** from the repo's Actions tab on `master` (it creates the tag
   `playlist-bridge-v<version>` from `package.json`), or tag and push:
   `git tag playlist-bridge-v<version> && git push origin playlist-bridge-v<version>`.
   `.github/workflows/playlist-bridge-release.yml` checks a pushed tag matches `package.json`, runs the tests, runs
   `npm run release` and publishes the release with:
   - `playlist-bridge-extension-<v>-chrome.zip`: what users download (see [INSTALL.md](INSTALL.md))
   - `…-firefox.zip` + `…-sources.zip`: for AMO unlisted signing. The sources zip is the review build input, and
     reviewers build it with `npm install && npm run build:firefox`
   - `SHA256SUMS.txt`
4. Firefox: sign the Firefox zip as unlisted on AMO and attach the signed `.xpi` to the same release.

`./instruction.sh release` makes the same files locally in `.output/` if you'd rather upload by hand. Name the release
tag the same way, or installed copies won't see it.

## Extension IDs
- **Chrome:** `eajdiknjbchmmmcdocfcoapelklimgff`, fixed by `CHROME_KEY` (a public key) in `wxt.config.ts`. Never
  change or remove it: every installed copy would get a new ID and lose its saved data. The matching private key isn't
  in the repo. Unpacked installs don't need it. It's only needed to sign a `.crx` or a Web Store upload with this ID.
  Versions before 1.1.0 had no key, so updating from one of them changes the ID once.
- **Firefox:** `playlist-bridge@utilities.aditya-n-suman`. Keep it, because updates of a signed add-on must use the same id.

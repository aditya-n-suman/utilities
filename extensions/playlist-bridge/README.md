# Playlist Bridge (browser extension)

Turn a public Spotify playlist into a YouTube playlist from your own browser. There's no server, no API key and no quota.
This is the Chrome + Firefox (MV3) version of [`apps/spotify-to-youtube`](../../apps/spotify-to-youtube/), with the same
matching and the same screens. The web app is unchanged.

## What it does
1. **Paste a link, right-click a playlist link, or click "Convert to YouTube" on a Spotify playlist page.**
2. The extension reads the playlist from Spotify's public pages, up to 500 tracks, with no Spotify login.
3. It searches YouTube Music, then YouTube, for every track. It scores the candidates exactly like the web app does,
   then lets you review, swap, search by hand or remove matches.
4. You get:
   - **Temporary links:** `youtube.com/watch_videos?…`, 50 videos per link. No sign-in needed.
   - **Save to my YouTube account:** uses the YouTube session already open in this browser. There's no Google
     sign-in screen, and you choose private, unlisted or public.
   - **A CSV match report.**

If you close the tab, your progress is kept: the next time you open the extension it offers "Pick up where you left off?"
for up to 7 days.

### Lyrics on YouTube Music
Open the **Lyrics** tab on music.youtube.com and a bar appears above the lyrics: **Off · Translate · Transliterate · Both**.
The extra lines appear under each original line, in a lighter style. Verse breaks, right-to-left lines and the lyrics
source stay as they are.
- **Translate** (to English): on-device first, with Chrome's built-in translator (Google's models, Chrome 138+). The
  first use of a language downloads its model, after a click. If the browser has no model for the language, or the
  lyrics are romanised (like Hindi in Latin letters), it uses Google Translate online, but only after you allow it.
- **Transliterate**: the same words in another script. "یوں زندگی" becomes "yon zandgi", and romanised Hindi
  "tum hi ho" becomes "तुम ही हो". Browsers can't do this on-device, so it always uses Google Translate online.
- The choice is remembered and applies to every song. Only static lyrics are supported. Synced (highlighted) lyrics
  aren't yet.

## Install (unpacked / self-distributed)
**Users:** follow [INSTALL.md](INSTALL.md). Download the Chrome zip from the
[releases](https://github.com/aditya-n-suman/utilities/releases?q=playlist-bridge&expanded=true), unzip it into a
folder you'll keep, and load it with **Load unpacked** in Developer mode.

Why not a one-click install: Chrome on Windows and macOS only installs extensions from outside the Web Store through
Developer mode or enterprise policy on managed machines. Because of that:
- **The extension ID is fixed** by a `key` in the Chrome manifest (`wxt.config.ts`). Otherwise Chrome derives the ID
  from the folder path, and unzipping an update somewhere else would lose saved matches, the unfinished conversion
  and settings.
- **Updates are announced in the app.** Once a day it reads this repo's public releases list from GitHub and shows
  "Update to x.y.z" when a newer `playlist-bridge-v*` release exists.

**From source** (Node 20+):
```bash
cd extensions/playlist-bridge
./instruction.sh build        # → .output/chrome-mv3 and .output/firefox-mv3
```
Then load `.output/chrome-mv3` with **Load unpacked**.

**Firefox 142+**
- *Try it:* open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick
  `.output/firefox-mv3/manifest.json`. Firefox removes it when it restarts.
- *Keep it installed:* release Firefox only installs signed add-ons. Sign it as **unlisted**
  on addons.mozilla.org: it gets signed but isn't published. Run `./instruction.sh zip` and upload
  `.output/playlist-bridge-extension-<v>-firefox.zip` (plus the `-sources.zip`) at
  <https://addons.mozilla.org/developers/addon/submit/distribution>, choosing "On your own". Then install the signed
  `.xpi`. Firefox Developer Edition and Nightly can instead set `xpinstall.signatures.required=false` in `about:config`.

See [SETUP.md](SETUP.md) for the manual checks, troubleshooting and how to release.

## Permissions and why
| Asked for | Why |
|---|---|
| `open.spotify.com` | Read the public playlist page, and add the "Convert to YouTube" button |
| `api-partner.spotify.com` | Load playlists with more than 100 songs |
| `open.spotifycdn.com` | Reconnect if Spotify changes how its player loads playlists |
| `music.youtube.com` | Search YouTube Music, save the playlist to your account, and show the lyrics bar |
| `www.youtube.com` | Search YouTube for songs missing from YouTube Music |
| `declarativeNetRequestWithHostAccess` | YouTube's internal API refuses requests without its own Origin/Referer, so the extension sets them on `/youtubei/` calls it makes (`public/rules/youtube-headers.json`) |
| `cookies` | Read YouTube's `SAPISID` cookie to sign the save request, the same way youtube.com does |
| `contextMenus` | "Convert with Playlist Bridge" on right-click |
| `storage` | Remember the Spotify query hash if Spotify changes it, when it last checked for updates, and the lyrics bar's mode |
| *optional:* `spotify.link`, `spoti.fi` | Only requested when you paste a short link |

## Privacy
- Nothing leaves your browser except requests to Spotify and YouTube, plus one update check a day to GitHub's public
  releases list (`api.github.com`, no cookies). There's no analytics and no server of ours.
- **Lyrics:** on-device translation keeps the lyrics in your browser. Only after you click **Allow Google Translate
  online** on the lyrics bar are lyrics lines sent to Google (`translate.googleapis.com`, and `inputtools.google.com` for
  romanised lyrics), without cookies. "Stop using Google online" on the bar turns that off again. Online results are
  cached in the extension for 30 days, and "Clear saved matches" deletes them.
- **Searches are sent without cookies**, so they don't touch your YouTube history or recommendations.
- Only **Save** uses your YouTube session. It creates one playlist and adds the videos to it, and does nothing else.
- The match cache (30 days) and the unfinished conversion (7 days) are kept in the extension's IndexedDB. You can
  delete them under ⋯ → **Clear saved matches**.

## Limits and risks
- This tool uses Spotify's and YouTube's **internal, undocumented** endpoints. Either site can change them without
  notice. Spotify query-hash changes are recovered automatically. Anything else needs a code update, so use
  ⋯ → **Report a problem**.
- It's meant for personal use, which is why it's distributed through GitHub releases and not listed in the stores.
- Only public playlists work. Up to 500 tracks are converted per run.
- Saving uses the first signed-in Google account in the browser (`X-Goog-AuthUser: 0`). YouTube brand accounts and
  channel switching aren't supported.
- Online lyrics translation uses Google's keyless web endpoints, which are unofficial. Google rate-limits busy IPs;
  translation then falls back to a second endpoint, but transliteration fails with a Retry until the limit lifts.
- From datacenter or VPN IPs, YouTube Music's songs catalog can return nothing. Matching then falls back to videos, and
  quality drops a little.

## How it's built
- [WXT](https://wxt.dev) + React + TypeScript.
- The engine (`src/engine/`) is a TypeScript port of the web app's Python backend. The matcher and rapidfuzz scorers
  are checked against the Python output (`tests/unit/golden.test.ts`).
- Code map, decisions and next steps: [STATUS.md](STATUS.md).

# STATUS: Spotify → YouTube playlist converter ("Playlist Bridge")

_Last updated: 2026-10-09 · branch `claude/fervent-bell-850qu2` · no PR opened yet_

This is a handoff note for the next coding session. Read it first, then `REQUIREMENTS.md` (scope and decisions), `README.md` (setup and architecture) and `DESIGN_BRIEF.md` (the UI ↔ API data contract).

## Where things stand

| Area | State |
|---|---|
| Backend (FastAPI) | ✅ Done. 55 pytest tests pass, all offline and fixture-based |
| Frontend (React + Vite + TS) | ✅ Done. Built from `design/Playlist Bridge.dc.html`; 7 vitest tests pass |
| End-to-end | ✅ Ran a headless Chromium run of the full flow against live Spotify and YouTube (details below) |
| Save to YouTube account | ⚠️ **Code written, never run against real Google.** Needs an OAuth client |
| In-row YouTube preview | ⚠️ Showed black in headless Chromium. Still to check in a real browser |
| Deployment | ❌ Not started |

## Run it

```bash
# backend
cd apps/spotify-to-youtube/backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                       # GOOGLE_CLIENT_ID/SECRET optional
pytest                                     # expect 55 passed
python -m scripts.smoke "https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe" --limit 20
uvicorn app.main:app --reload --env-file .env   # :8000

# frontend
cd ../frontend
npm install
npm test                                   # expect 7 passed
npm run dev                                # :5173, proxies /api → :8000
npm run build                              # dist/; then the backend serves the UI at :8000 by itself
```

## Map of the code

```
backend/app/
  main.py              FastAPI routes, SSE stream, session cookie, serves frontend/dist
  jobs.py              in-memory jobs + append-only event log (fetching/playlist/match/done/failed)
  models.py            Track, Playlist, Candidate, Match (pydantic)
  config.py            env settings (MAX_TRACKS, SEARCH_CONCURRENCY, GOOGLE_*, …)
  cache.py             SQLite cache: track → ranked candidates (30 days)
  sources/             reading Spotify (no API keys)
    resolve.py           any link form → playlist id (follows spotify.link short links)
    embed.py             tier 1: /embed/playlist page → __NEXT_DATA__ (first 100 tracks + anon token)
    pathfinder.py        tier 2: web-player GraphQL fetchPlaylist paging with that token
    webplayer.py         tier 3: headless Playwright, used only when tier 2's query hash goes stale
    paste.py             "Artist - Title" lines / Exportify-style CSV
  youtube/
    search.py            ytmusicapi songs → ytmusicapi videos → yt-dlp, with a breaker and retries
    matcher.py           title cleanup + scoring → high/medium/low/none
    playlist.py          watch_videos temp links (50/link), ytmusicapi create_playlist
    auth.py              Google device-code flow (tokens in memory only)
backend/scripts/smoke.py   live CLI check
backend/tests/             fixtures: real embed HTML (token redacted) + pathfinder JSON
frontend/src/
  App.tsx              screen state, SSE wiring, row handlers, theme
  state.ts             reducer + pure helpers (unit-tested in state.test.ts)
  api.ts               typed API client (keep in sync with DESIGN_BRIEF.md)
  copy.ts              all user-facing strings from the design
  components/          Header, Landing, PlaylistCard(+Fetching), MatchList, TrackRow, Result(+SaveCard, SignInModal), ErrorScreen
  styles.css           design tokens + styles carried over from the prototype
design/Playlist Bridge.dc.html   Claude Design prototype (reference only, never served)
```

## Facts that aren't obvious from the code

- **Why scraping:**
  - Spotify's official API (since Feb 2026) won't list the tracks of playlists the user doesn't own.
  - Google Custom Search shuts down on 2027-01-01.
  - The product owner chose scraping public pages plus unofficial YouTube libraries. See the risk section in `README.md`.
- **Spotify embed page:** capped at 100 tracks. It carries an anonymous access token that works on `api-partner.spotify.com/pathfinder/v2/query`.
- **Stale query hash:** Spotify answers `412 "Invalid query hash"` when the persisted-query hash goes stale. Tier 3 rediscovers it at runtime; you can also pin it with `SPOTIFY_FETCH_PLAYLIST_HASH`.
- **Missing or private playlists:** the embed page returns 200 with no `entity`, and pathfinder returns `__typename: GenericError`. Both map to `playlist_unavailable`.
- **YouTube Music songs catalog:** returned **no results from the cloud container's IP**, while video search worked. The search layer skips the songs step after 3 empty results in a row (for 10 minutes). On a home connection the songs step should work and raise match quality; this is unverified.
- **Temporary links:** `youtube.com/watch_videos?video_ids=…` works when opened in a normal browser (the product owner confirmed it). Google's bot check blocks it from datacenter IPs. The server only builds the URL.
- **Matching quality** (cloud IP, without the songs catalog):
  - 80s: 40/40 high
  - Hindi: 20 matched (13 high, 7 medium)
  - Today's Top Hits: 50/50 (49 high)
- **`alternatives`** never contains the `chosen` video; the UI shows `[chosen, ...alternatives]`.
- **`picked: true`** marks a user-chosen match; it doesn't count as "needs review".
- **Counts:** `counts.error` is separate from `not_found`. The summary's "Skipped" = `removed + error`.
- **Settled state:** the UI is "settled" when `finished && counts.done === counts.total`. Retries put rows back to `pending`, and the backend sends no second `done` event.
- **Jobs and sign-ins** live in process memory, so a restart loses them. One worker only; no multi-worker deploy without a shared store.

## Next steps (in priority order)

1. **Verify save to account.**
   - Create a Google Cloud OAuth client of type "TVs and Limited Input devices" with the YouTube Data API v3 enabled. Steps are in `README.md`.
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then run a conversion and click "Sign in with Google to save".
   - Check:
     - the device-code modal, its countdown and the expired/denied states
     - `ytmusicapi.create_playlist` plus batched `add_playlist_items` for playlists over 50 videos
     - that the token dict built in `youtube/auth.py::poll_flow` is accepted by `YTMusic(auth=…, oauth_credentials=…)`
2. **Check in a real browser:**
   - the YouTube preview iframe (`youtube-nocookie.com/embed/<id>`)
   - temporary links with 50 IDs
   - the songs-catalog search quality (run `scripts.smoke` locally and compare with the numbers above)
3. **Add a repeatable e2e test.** The cloud session's Playwright script was a throwaway. Port it to `frontend/e2e/` or `backend/tests/e2e/`, with a mocked backend for CI, covering: invalid link → example link → convert → review → swap → search → remove → create → CSV → error screen → paste flow.
4. **Deployment:**
   - single process: `uvicorn` serving `frontend/dist`
   - a Dockerfile installing Chromium only if `ENABLE_BROWSER_FALLBACK=1`
   - persist `CACHE_PATH`
   - optionally put rate limiting in front
5. **Nice to have:**
   - per-track album art for playlists under 100 tracks (the embed has none, but a pathfinder call could add it)
   - surface `playlist.description`
   - a "copy all links" button when the result is split

## Conventions

- Backend: plain FastAPI + pydantic. Keep the network out of unit tests and add fixtures under `backend/tests/fixtures/`.
- Frontend:
  - no UI library
  - visuals must match the prototype (tokens and spacing in `styles.css`)
  - put strings in `copy.ts`
  - keep `api.ts` types and `DESIGN_BRIEF.md` in step with the backend
- Repo: each utility lives under `apps/<name>/` with its own README; the root `README.md` indexes them.

# Spotify → YouTube playlist converter

Paste a public Spotify playlist link. The app reads the track list from Spotify's public web pages, finds each song on YouTube, lets you review the matches, and gives back:

- **a temporary YouTube playlist link**: no sign-in needed, opens in the user's own browser, and holds up to 50 videos per link, so longer playlists are split into parts; and
- optionally, **a real playlist saved to your YouTube account**, which you can share.

No Spotify or YouTube API keys are needed for converting. Saving to an account needs a Google OAuth client (see below).

```
apps/spotify-to-youtube/
├── REQUIREMENTS.md     agreed scope, flow, feasibility findings
├── DESIGN_BRIEF.md     UI/UX brief + API contract for the frontend
├── design/             Claude Design prototype the UI is built from (reference only)
├── backend/            Python 3.11+ / FastAPI
└── frontend/           React 18 + Vite + TypeScript ("Playlist Bridge" UI)
```

## Quick start (backend)

```bash
cd apps/spotify-to-youtube/backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # optional tweaks

# Try it from the command line
python -m scripts.smoke "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" --limit 20
python -m scripts.smoke --text "a-ha - Take On Me\nToto - Africa"

# Run the API (http://localhost:8000/docs)
uvicorn app.main:app --reload --env-file .env

# Tests (offline, fixture-based)
pytest
```

The smoke script prints every match with its confidence, then the temporary YouTube link(s).

## Frontend

```bash
cd apps/spotify-to-youtube/frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to the backend on :8000
npm test           # unit tests (vitest)
npm run build      # outputs dist/
```

Once `frontend/dist` exists, the backend serves the app itself, so in production you only run
`uvicorn app.main:app` and open http://localhost:8000.

The UI follows the Claude Design prototype in `design/Playlist Bridge.dc.html`:
- landing (link or pasted list / CSV)
- fetching
- live matching
- review (filters, swap / search / preview / remove)
- result (temporary links, save to account, summary)
- error screens

It has light and dark themes and is fully keyboard-accessible.

## How it works

### 1. Reading the Spotify playlist (`app/sources/`)
| Tier | Source | Gives |
|---|---|---|
| 1 | `open.spotify.com/embed/playlist/<id>`, using the `__NEXT_DATA__` JSON in the page | name, owner, cover, the **first 100** tracks (title, artists, duration, explicit), and an anonymous access token |
| 2 | the web player's GraphQL `pathfinder` `fetchPlaylist`, called with that token | the rest of the tracks, 100 per page, plus album and cover |
| 3 | headless Chromium (Playwright) loading the real web player | used only if tier 2 breaks. It captures the current query hash so tier 2 works again afterwards |
| — | pasted `Artist - Title` lines or a CSV upload (Exportify format works) | fallback for private playlists, or when Spotify changes its pages |

Short links (`spotify.link/…`), `intl-xx` paths, `spotify:playlist:` URIs and bare IDs all work.

### 2. Finding each song on YouTube (`app/youtube/search.py`)
Each track goes through these layers. It stops as soon as a good-enough match turns up:
1. `ytmusicapi` search of the **YouTube Music songs** catalog (official audio).
2. `ytmusicapi` search of **YouTube Music videos**.
3. `yt-dlp` `ytsearch` (plain YouTube search).

If the songs catalog keeps coming back empty, it is skipped for 10 minutes. Some datacenter IPs get no results from it.

Searches run with limited concurrency, retry with backoff, and are cached in SQLite for 30 days.

### 3. Scoring matches (`app/youtube/matcher.py`)
- Release noise is cleaned from Spotify titles first: `- Remastered 2011`, `(feat. …)`, `(From "Film")`, `- Single Version`, and so on.
- Each candidate gets a weighted score:
  - **title similarity** (45%)
  - **artist similarity** (30%), measured against the channel name and the video title
  - **duration match** (25%)
- Penalties apply for live, cover, remix, karaoke, sped-up, 8D/16D, chords and similar versions, unless the Spotify title has the same word. Lyric videos get a light penalty.
- Bonuses apply for YouTube Music songs, artist "Topic" channels, the artist's own channel, and "Official" uploads.
- The final score maps to a confidence label: **high ≥ 0.78**, **medium ≥ 0.6**, **low ≥ 0.42**, and anything lower counts as not found.

### 4. Output (`app/youtube/playlist.py`)
- **Temporary link:** `https://www.youtube.com/watch_videos?video_ids=a,b,c`, 50 IDs per link. The server only builds the URL; the user's own browser opens it.
- **Save to account:** a Google device-code sign-in ("go to google.com/device, enter the code"), then `ytmusicapi` `create_playlist` with private, unlisted or public visibility. The token is kept in server memory only and expires with the session.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | `{ok, save_enabled, max_tracks}` |
| POST | `/api/convert` | `{url}` or `{text, name?}` → `{job_id}` (202). Returns 400 `invalid_link` for anything that isn't a Spotify playlist link |
| GET | `/api/jobs/{id}` | full snapshot: status, playlist, matches, counts |
| GET | `/api/jobs/{id}/events` | **SSE** with events `fetching` (early metadata), `playlist`, `match`, `done` and `failed`. Supports `Last-Event-ID` |
| PATCH | `/api/jobs/{id}/matches/{i}` | `{action: choose\|remove\|restore\|retry, candidate?}` |
| GET | `/api/jobs/{id}/matches/{i}/search?q=` | manual search, ranked against that track |
| POST | `/api/jobs/{id}/retry-errors` | re-run every failed search in the background |
| GET | `/api/search?q=` | unranked manual search |
| POST | `/api/jobs/{id}/links` | the temporary playlist link(s) |
| GET | `/api/jobs/{id}/report.csv` | match report |
| GET/POST/DELETE | `/api/auth/youtube[/start\|/poll]` | device-code sign-in status, start, poll and sign-out |
| POST | `/api/jobs/{id}/save` | `{title?, description?, privacy}` → saved playlist URLs |

Job failure codes: `invalid_link`, `playlist_unavailable`, `spotify_changed`, `spotify_unreachable`, `empty`.

## Enabling "Save to my YouTube account"
1. In Google Cloud Console, create a project and enable **YouTube Data API v3**.
2. Configure the OAuth consent screen. While it's in testing mode, add your Google accounts as test users.
3. Create an OAuth client ID of type **"TVs and Limited Input devices"**.
4. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

## Limits and risks
- **This depends on unofficial interfaces.** Spotify's embed page and web-player GraphQL, YouTube Music's internal API and YouTube search all go through community libraries. Any of them can change without notice:
  - The Spotify parsing is covered by fixture tests, so when a page changes, the tests show where.
  - A stale Spotify query hash is rediscovered automatically by the browser fallback.
  - If YouTube starts failing, update `ytmusicapi` and `yt-dlp` first.
- **Terms of service.** Spotify's terms forbid scraping, and YouTube's terms restrict automated access. This is meant as a personal or small-group tool, not a commercial service.
- **What it reads and stores.** Only public playlist metadata is read: titles, artists, durations and cover URLs. Nothing is downloaded or re-hosted. Nothing about users is stored, apart from the track→video match cache and short-lived in-memory OAuth tokens.
- **Rate limits.** Keep `SEARCH_CONCURRENCY` low. Heavy use from one IP can trigger throttling or bot checks.
- **Temporary links.** They depend on an undocumented YouTube URL (confirmed working, Oct 2026). If it stops working, use the saved-playlist option.

# Requirements: Spotify → YouTube playlist converter

_Agreed October 2026._

## Goal
A web app where a user pastes a public Spotify playlist link and gets back a YouTube playlist with the same songs:
- an anonymous **temporary link** (the primary output), and
- optionally, a **playlist saved to their YouTube account** that they can share.

## Decisions
| Topic | Decision |
|---|---|
| Spotify data | Read public playlist metadata from Spotify's web interface (embed page plus the web player's GraphQL), not the Spotify Web API. |
| YouTube search | Existing Python libraries: `ytmusicapi`, with `yt-dlp` as fallback. Not the YouTube Data API and not Google search. |
| Output | Temporary `watch_videos` link always. "Save to my YouTube account" is optional. |
| Fallback input | Paste a track list or upload a CSV, for private playlists or when Spotify changes its pages. |
| Stack | Python FastAPI backend, React + Vite + TypeScript frontend, in `apps/spotify-to-youtube/`. |
| Scope | Up to 500 tracks per playlist (configurable). Public playlists only. |

## Why not the official APIs (findings)
- **Spotify Web API (since February 2026):**
  - Development-mode apps can't read the track list of playlists the user doesn't own or collaborate on.
  - They're limited to 5 users and need a Premium owner.
  - Extended quota requires an organization with 250k+ monthly active users.
- **Google Custom Search JSON API:** closed to new customers, and shut down for everyone on 2027-01-01.
- **YouTube Data API:** search costs 100 of the 10,000 free daily units, so only about 100 track lookups a day.

## Verified by live probes (Oct 2026)
- ✅ The Spotify embed page returns metadata, the first 100 tracks and an anonymous token, with no login.
- ✅ That token works on the web player's `pathfinder` `fetchPlaylist`. A 150-track playlist was fetched in full in 1.5s over plain HTTP.
- ✅ The headless web player reaches the same data; it's kept as the fallback when the query hash goes stale.
- ✅ `ytmusicapi` video search and `yt-dlp` search work. The YouTube Music *songs* catalog returns nothing from the cloud test server; it's expected to work from normal IPs, and the search falls back automatically.
- ✅ The `youtube.com/watch_videos?video_ids=…` temporary playlist works when opened in a normal browser (confirmed by the product owner).
- Matching quality across 110 live tracks (80s pop and Hindi hits): every track matched, about 80% high confidence and the rest medium. This was measured without the songs catalog.

## User flow
1. **Landing:** paste a Spotify playlist link, or switch to "paste a track list / upload CSV".
2. **Fetching:** show the playlist header (cover, name, owner, track count).
3. **Matching:** results stream in live. Each row shows the Spotify track, the YouTube match and a confidence label.
4. **Review:** for weak matches, swap to an alternative, search manually, remove the track, or retry.
5. **Result:**
   - temporary link(s) to open or copy
   - optionally, save to a YouTube account (device-code sign-in; private, unlisted or public)
   - a downloadable CSV of the matches
6. **Errors:**
   - invalid link
   - private or missing playlist
   - Spotify changed or unreachable (offer the paste fallback)
   - search unavailable (offer retry)

## Boundaries
- Public metadata only. No audio or preview downloads, no getting around DRM, no access to private or authenticated content.
- No user data is persisted. OAuth tokens live in server memory only. The cache holds only track → video mappings.
- Polite request rates: low concurrency, caching, backoff.
- This is a personal / small-group tool. Scraping goes against the platforms' terms, so it isn't meant for a commercial launch.

## Build phases
- [x] 0. Feasibility spikes (Spotify tiers, YouTube search, temporary link)
- [x] 1. Backend: sources and models, with tests
- [x] 2. Backend: search and matching, with tests
- [x] 3. Backend: job pipeline, SSE stream, temporary links, CSV report, CLI smoke script
- [x] 4. Backend: save to account (device-code sign-in). **Needs a Google OAuth client to verify live.**
- [x] 5. Frontend from the Claude Design output (`frontend/`, built from `design/Playlist Bridge.dc.html`)
- [x] 6. End-to-end browser test of the full flow against live Spotify/YouTube, plus light/dark/mobile checks
- [ ] 7. Verify "save to account" with a real Google OAuth client, then deploy

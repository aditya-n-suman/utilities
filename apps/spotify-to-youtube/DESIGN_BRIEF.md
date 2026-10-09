# Design brief: "Playlist Bridge"

This is the prompt given to Claude Design, plus the data the UI will receive from the backend. Designs should only show data that exists below.

## Prompt
> Design a clean, single-purpose web app called "Playlist Bridge" that converts a Spotify playlist into a YouTube playlist. Desktop-first but fully responsive, with light and dark modes.
>
> **Screens:**
> 1. **Landing:** a hero with one large input, "Paste a Spotify playlist link", and a Convert button. Below it, a secondary link "or paste a track list / upload CSV" opens a textarea and file drop zone. Add a small note: "Public playlists only."
> 2. **Fetching:** a playlist header card (cover art, name, owner, track count) with a skeleton track list. For playlists over 100 tracks, show an inline note: "Loading full playlist…"
> 3. **Matching (live):** a progress bar with a running "42 / 87 matched" count. A two-column track list fills in as results arrive. Left: Spotify title, artists, duration. Right: YouTube thumbnail, video title, channel, and a match-quality chip (High in green, Medium in amber, Low in orange, Not found in red), plus a small "±3s" duration difference.
> 4. **Review:** filter tabs (All, Needs review, Not found). Each row can swap the match (a dropdown of 3 alternatives with thumbnails and an inline YouTube preview), search by hand, or remove the track. A sticky footer has a "Create playlist" button.
> 5. **Result:**
>    - Main card, "Your YouTube playlist is ready": Open on YouTube and Copy link buttons. If the playlist is split, show "Part 1 of 2".
>    - Secondary card, "Save to my YouTube account": a choice of Private, Unlisted or Public. Signing in opens a modal that shows a device code: "Go to google.com/device and enter ABCD-EFGH". It ends with a shareable permanent link.
>    - Summary: matched, skipped and not-found counts, and a "Download match report (CSV)" button.
> 6. **Error and empty states:**
>    - Invalid link.
>    - Private or missing playlist, with a link to the paste fallback.
>    - Spotify fetch failed.
>    - YouTube search slowed down (Retry button).
>    - Partial results.
>
> **Tone:** minimal, music-forward, friendly. Use subtle Spotify-green → YouTube-red accents without copying either brand's logos. Make sure keyboard navigation and screen-reader labels work, and that the long track list stays smooth to scroll.

## Data available to the UI

**Playlist** (in the SSE `playlist` event and the snapshot):
```json
{ "id": "37i9dQZF1DX4UtSsGT1Sbe", "name": "All Out 80s", "owner": "Spotify",
  "cover_url": "https://i.scdn.co/image/…", "total": 150, "track_count": 150,
  "source": "pathfinder" }
```
`total` is the size of the Spotify playlist. `track_count` is how many will be converted; it's lower when the playlist exceeds the cap.

**Match** (one per track; sent again on every change):
```json
{ "index": 0, "status": "matched", "confidence": "high", "error": null,
  "track": { "title": "La Isla Bonita", "artists": ["Madonna"], "album": "True Blue",
             "duration_ms": 242733, "explicit": false, "cover_url": "https://i.scdn.co/…" },
  "chosen": { "video_id": "zpzdgmqIHOQ", "title": "La Isla Bonita", "channel": "Madonna",
              "duration_s": 243, "source": "ytmusic_video", "score": 1.0,
              "thumbnail": "https://i.ytimg.com/vi/zpzdgmqIHOQ/mqdefault.jpg",
              "url": "https://www.youtube.com/watch?v=zpzdgmqIHOQ" },
  "alternatives": [ /* up to 4 other candidates (never the chosen one), same shape */ ] }
```
- `status` is one of `pending | matched | not_found | removed | error`.
- `confidence` is one of `high | medium | low | none`.
- `album` and `cover_url` are present for playlists over 100 tracks and absent for shorter ones, so per-track artwork must be optional in the design.

**Counts:** `{ total, done, high, medium, low, not_found, removed, error }`

**Match** also carries `picked: true` after the user chooses a candidate during review.

**Temporary links:** `{ "links": [{ "part": 1, "of": 2, "url": "…" }], "video_count": 87 }`

**Sign-in:** `{ user_code, verification_url, interval, expires_at }`. Poll results: `pending | authorized | expired | denied`.

**Saved playlist:** `{ playlist_id, urls: { youtube, youtube_music }, video_count }`

**Errors** (`code`): `invalid_link`, `playlist_unavailable`, `spotify_changed`, `spotify_unreachable`, `empty`, `search_unavailable`, `save_disabled`, `not_signed_in`, `save_failed`.
`save_disabled` means the server has no Google client configured, so the save card should be hidden; `/api/health` reports this as `save_enabled`.

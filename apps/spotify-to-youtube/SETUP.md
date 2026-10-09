# Setup on a new machine

Playlist Bridge (Spotify → YouTube): FastAPI backend + React/Vite frontend.

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Git | any | `git --version` |
| Python | 3.11 or newer (3.14 tested) | `python3 --version` |
| Node.js + npm | 20 or newer (22 tested) | `node -v` |
| Bash + curl | any | Linux/macOS, or WSL/Git Bash on Windows |

Install examples:

```bash
# Fedora
sudo dnf install git python3 nodejs npm
# Debian/Ubuntu
sudo apt install git python3 python3-venv python3-pip nodejs npm
# macOS (Homebrew)
brew install git python node
```

Notes:
- On Debian/Ubuntu, `python3-venv` is required or venv creation fails.
- Don't put the project on an exFAT/FAT drive if venv creation fails there; use a native filesystem.

## 2. Get the code

```bash
git clone <repo-url> utilities
cd utilities/apps/spotify-to-youtube
```

## 3. Quick path (recommended)

```bash
./instruction.sh setup   # venv, pip install, .env, npm install
./instruction.sh test    # expect 55 backend + 7 frontend tests passing
./instruction.sh dev     # UI http://localhost:5173, API http://localhost:8000
```

If the script isn't executable: `chmod +x instruction.sh`.

## 4. Manual path

```bash
# Backend
cd backend
python3 -m venv .venv
. .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
pytest                          # 55 passed
uvicorn app.main:app --reload --env-file .env    # :8000

# Frontend (new terminal)
cd frontend
npm install
npm test                        # 7 passed
npm run dev                     # :5173, proxies /api to :8000
```

Single-process mode (backend serves the built UI): `npm run build` in `frontend/`, then run uvicorn and open http://localhost:8000. Or `./instruction.sh prod`.

## 5. Configuration (`backend/.env`)

Defaults work out of the box. Commonly changed values:

| Variable | Purpose |
|---|---|
| `MAX_TRACKS` | Max tracks per playlist (default 500) |
| `SEARCH_CONCURRENCY` | Parallel YouTube searches (keep low) |
| `YTMUSIC_LOCATION` | Region for YouTube Music, e.g. `IN`, `US` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enable "Save to my YouTube account" (optional) |
| `ENABLE_BROWSER_FALLBACK` | Headless Spotify web-player fallback (needs Chromium) |
| `CHROMIUM_EXECUTABLE` | Use an existing Chrome/Chromium instead of Playwright's |
| `SPOTIFY_FETCH_PLAYLIST_HASH` | Pin the Spotify query hash if it goes stale |

`.env` is git-ignored; never commit it.

### Optional: headless browser fallback

Only needed if Spotify's persisted-query hash goes stale:

```bash
cd backend && . .venv/bin/activate
playwright install chromium
```

### Optional: save to a YouTube account

1. In Google Cloud Console, create a project and enable **YouTube Data API v3**.
2. Create an OAuth client of type **TVs and Limited Input devices**.
3. Put the ID and secret in `backend/.env` and restart the backend.
4. `curl localhost:8000/api/health` should show `"save_enabled": true`.

This flow has not yet been verified against a real Google client (see STATUS.md).

## 6. Verify it works

```bash
curl localhost:8000/api/health                  # {"ok":true,...}
./instruction.sh smoke --limit 20               # live Spotify + YouTube check, no server
```

Then open the UI, paste a public Spotify playlist link, and convert.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `ensurepip`/venv error | Install `python3-venv` (Debian/Ubuntu) |
| Port 8000 or 5173 in use | `PORT=8001 ./instruction.sh dev` (backend port), or free the port |
| `412 Invalid query hash` | Enable `ENABLE_BROWSER_FALLBACK=1` and `playwright install chromium`, or set `SPOTIFY_FETCH_PLAYLIST_HASH` |
| Few matches / empty YouTube Music songs | Datacenter/VPN IPs get empty results; the app falls back to video search automatically. Try a home connection |
| Temporary link shows a bot check | Open it in a normal browser on a residential IP |
| Jobs lost after restart | Expected: jobs and sign-ins live in memory. Run a single worker |

## 8. More docs

- [README.md](README.md): architecture and risks
- [REQUIREMENTS.md](REQUIREMENTS.md): scope and decisions
- [STATUS.md](STATUS.md): current state and next steps
- [DESIGN_BRIEF.md](DESIGN_BRIEF.md): UI ↔ API contract

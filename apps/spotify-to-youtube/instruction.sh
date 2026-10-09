#!/usr/bin/env bash
# Local runner for Playlist Bridge (Spotify -> YouTube).
#
#   ./instruction.sh setup   install backend + frontend dependencies (idempotent)
#   ./instruction.sh test    run backend and frontend tests
#   ./instruction.sh dev     backend :8000 (reload) + Vite dev server :5173  [default]
#   ./instruction.sh prod    build the frontend, serve everything from :8000
#   ./instruction.sh smoke [spotify-url] [--limit N]   live CLI check, no server
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PORT="${PORT:-8000}"

setup() {
  cd "$BACKEND"
  [ -d .venv ] || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements-dev.txt
  [ -f .env ] || cp .env.example .env
  cd "$FRONTEND"
  [ -d node_modules ] || npm install
}

activate() { . "$BACKEND/.venv/bin/activate"; }

serve_backend() {
  cd "$BACKEND"
  uvicorn app.main:app --env-file .env --port "$PORT" "$@"
}

case "${1:-dev}" in
  setup) setup; echo "Setup done." ;;
  test)
    setup; activate
    (cd "$BACKEND" && pytest -q)
    (cd "$FRONTEND" && npm test)
    ;;
  dev)
    setup; activate
    trap 'kill 0' EXIT INT TERM
    (cd "$FRONTEND" && API_URL="http://localhost:$PORT" npm run dev) &
    echo "UI: http://localhost:5173   API: http://localhost:$PORT"
    serve_backend --reload
    ;;
  prod)
    setup; activate
    (cd "$FRONTEND" && npm run build)
    echo "App: http://localhost:$PORT"
    serve_backend
    ;;
  smoke)
    setup; activate; shift
    cd "$BACKEND"
    python -m scripts.smoke "${1:-https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe}" "${@:2}"
    ;;
  *) sed -n '2,9p' "$0"; exit 1 ;;
esac

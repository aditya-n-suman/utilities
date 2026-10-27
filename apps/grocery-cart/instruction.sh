#!/usr/bin/env bash
# Local runner for Grocery Cart.
#
#   ./instruction.sh setup                 install dependencies (idempotent)
#   ./instruction.sh test                  unit tests + typecheck
#   ./instruction.sh chrome                start Chrome with its own profile and remote debugging (leave it open)
#   ./instruction.sh record [jiomart]      Phase 0: record one search + add-to-cart done by hand
#   ./instruction.sh summarize [dir]       rewrite summary.md for the newest (or given) capture
#   ./instruction.sh probe [--query "toor dal"] [--add] [dir]
#                                          Phase 0: replay the captured search (and add) from the shop's tab
#   ./instruction.sh e2e                   Phase 0 tools against a local stand-in shop (no network)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${GROCERY_CHROME_PORT:-9222}"

setup() { [ -d node_modules ] || npm install; }

chrome() {
  if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
    echo "Chrome is already listening on port $PORT."; return
  fi
  local bin="${CHROME:-}" profile="${GROCERY_CHROME_PROFILE:-$HOME/.config/grocery-cart-chrome}"
  local -a cmd
  if [ -z "$bin" ]; then
    for b in google-chrome-stable google-chrome chromium-browser chromium; do
      if command -v "$b" >/dev/null; then bin="$b"; break; fi
    done
  fi
  if [ -n "$bin" ]; then
    cmd=("$bin")
  elif command -v flatpak >/dev/null && flatpak info com.google.Chrome >/dev/null 2>&1; then
    # Flatpak Chrome can always write under its own ~/.var/app folder.
    profile="${GROCERY_CHROME_PROFILE:-$HOME/.var/app/com.google.Chrome/grocery-cart-profile}"
    cmd=(flatpak run com.google.Chrome)
  else
    echo "Chrome not found. Install it, or set CHROME=/path/to/chrome." >&2; exit 1
  fi
  mkdir -p "$profile"
  # Chrome 136+ only opens the debugging port for a non-default --user-data-dir, so this is a separate profile:
  # sign in to the shop there once and it stays signed in. The port listens on 127.0.0.1 only.
  nohup "${cmd[@]}" --remote-debugging-port="$PORT" --user-data-dir="$profile" --no-first-run \
    "https://www.jiomart.com/" >/dev/null 2>&1 &
  for _ in $(seq 1 50); do
    if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
      echo "Chrome is up (profile: $profile, port: $PORT). Leave it open; close it when you're done."; return
    fi
    sleep 0.2
  done
  echo "Chrome started but port $PORT isn't answering. Is another Chrome using that profile? Close it and retry." >&2
  exit 1
}

case "${1:-}" in
  setup) setup; echo "Setup done." ;;
  test) setup; npm test; npm run typecheck ;;
  chrome) chrome ;;
  record) setup; npm run --silent record -- "${@:2}" ;;
  summarize) setup; npm run --silent summarize -- "${@:2}" ;;
  probe) setup; npm run --silent probe -- "${@:2}" ;;
  e2e) setup; npm run --silent e2e ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac

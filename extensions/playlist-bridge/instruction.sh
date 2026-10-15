#!/usr/bin/env bash
# Local runner for the Playlist Bridge browser extension.
#
#   ./instruction.sh setup            install dependencies (idempotent)
#   ./instruction.sh test             unit tests + typecheck
#   ./instruction.sh dev [firefox]    browser with the extension + hot reload  [default: chrome]
#   ./instruction.sh build            .output/chrome-mv3 and .output/firefox-mv3 (load unpacked)
#   ./instruction.sh zip              release zips for Chrome and Firefox (+ sources zip for AMO)
#   ./instruction.sh release          zips + SHA256SUMS.txt for a GitHub release (see SETUP.md → Release)
#   ./instruction.sh lint             web-ext lint of the Firefox build
#   ./instruction.sh e2e              live end-to-end run in Chromium (needs python playwright)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

setup() { [ -d node_modules ] || npm install; }

case "${1:-}" in
  setup) setup; echo "Setup done." ;;
  test) setup; npm test; npm run typecheck ;;
  dev)
    setup
    if [ "${2:-chrome}" = firefox ]; then npm run dev:firefox; else npm run dev; fi
    ;;
  build) setup; npm run build; npm run build:firefox ;;
  zip) setup; npm run zip; npm run zip:firefox; ls -1 .output/*.zip ;;
  release) setup; npm run release ;;
  lint) setup; npm run build:firefox; npm run lint:firefox ;;
  e2e) setup; npm run build; python3 tests/e2e/e2e.py .output/chrome-mv3 "${@:2}"; python3 tests/e2e/lyrics.py .output/chrome-mv3 ;;
  *) sed -n '2,11p' "$0"; exit 1 ;;
esac

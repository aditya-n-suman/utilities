# utilities

Multiple independent utilities: web apps under `apps/`, browser extensions under `extensions/`.

- `apps/spotify-to-youtube/`: **read `apps/spotify-to-youtube/STATUS.md` first.** It covers current state, how to run and test, a code map, non-obvious findings and the next steps.
- `apps/nginx-config-explorer/`: client-only React + Vite app for browsing `nginx -T` output. Read its `README.md` (code map, parser behaviour, limits). `npm test` runs the parser tests; `design/` holds the approved Claude Design canvas.
- `apps/grocery-cart/`: **read `apps/grocery-cart/STATUS.md` first.** Grocery list → JioMart cart via the user's own Chrome (CDP); Phases 0–1 done, Phase 2 (JioMart client, Quick + Shop all) built and awaiting a live check. Engine code in `src/engine/` must stay browser-free (the extension will reuse it). Raw captures hold cookies: never commit `captures/`.
- `extensions/playlist-bridge/`: **read `extensions/playlist-bridge/STATUS.md` first.** It's a separate browser-extension version of the converter; don't change `apps/` when working on it.

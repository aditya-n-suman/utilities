# utilities

Multiple independent utilities: web apps under `apps/`, browser extensions under `extensions/`.

- `apps/spotify-to-youtube/`: **read `apps/spotify-to-youtube/STATUS.md` first.** It covers current state, how to run and test, a code map, non-obvious findings and the next steps.
- `apps/nginx-config-explorer/`: client-only React + Vite app for browsing `nginx -T` output. Read its `README.md` (code map, parser behaviour, limits). `npm test` runs the parser tests; `design/` holds the approved Claude Design canvas.
- `apps/resume-builder/` (Folio): client-only React + Vite resume builder: Home, Import, and the workspace (form, live preview with click-to-edit, Fit). Read its `README.md` (routes, code map, how templates and page counting work, where it departs from the design) and `UX.md` (the journeys). `schema/resume.schema.json` is the contract every part uses; change it only with `schema/SCHEMA.md`, the examples and `src/lib/types.ts` in step. Templates use logical CSS only (a test enforces it). `npm test`; `design/` holds the Claude Design export.
- `extensions/playlist-bridge/`: **read `extensions/playlist-bridge/STATUS.md` first.** It's a separate browser-extension version of the converter; don't change `apps/` when working on it.

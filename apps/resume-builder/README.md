# Folio: resume builder

A client-only web app for making resumes. Fill in a form, or import a JSON file written by hand or by an AI chat, pick a template, download a PDF. Nothing is sent to a server.

Status: **templates 1–3 built.** Meridian, Ledger and Tracking render from the JSON contract, on A4 or Letter, left-to-right or right-to-left, and save to PDF through the print dialog. The app is currently the templates page from the design (`design/Folio Templates.dc.html`). The workspace (form, import, gallery) is designed in `design/Folio Workspace.dc.html` and not built yet.

## Run, test, build

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # schema, view model, markup, template render and CSS tests
npm run typecheck
npm run build      # static site in dist/, works from any folder
```

On the page, *Save as PDF* opens the browser's print dialog; pick "Save as PDF" as the destination. The file name comes from `meta.title` (default `<name> - Resume`).

## Code map

| Path | What |
|---|---|
| `src/lib/types.ts` | TypeScript view of the schema. Hand-written; keep it in step with `schema/resume.schema.json`. |
| `src/lib/view.ts` | `buildView(doc, opts)`: the only thing templates read. Formats dates and locations, parses markup, orders and hides sections, groups promotions, picks the avatar slot, splits main/side columns, and puts a `path` on every printed element for click-to-edit. Port of the design's `folio-lib.js` `view()`. |
| `src/lib/markup.tsx` | The schema's inline markup (`**bold**`, `*italic*`, `[label](https://…)`) to React. Everything else stays text. |
| `src/lib/format.ts` | Dates, ranges, locations, initials, accent contrast and tint. |
| `src/lib/print.tsx` | `printResume()`: renders the resume into a print-only root, sets `@page` size and margins, calls `print()`, cleans up on `afterprint`. |
| `src/templates/` | `registry.ts` (all 10 templates, 7 marked `soon`), `ResumePage.tsx` (the sheet: size, `dir`, `lang`, accent CSS variables), `Meridian`, `Ledger`, `Tracking` with their CSS, shared `parts.tsx`. |
| `src/pages/TemplatesPage.tsx` | The templates page: each template from `full.json` and `minimal.json` (alt accent), Ledger from `rtl.json`, Meridian's three avatar modes, page-break guides, page count and fit hint. |
| `design/` | Claude Design export: `Folio Templates.dc.html`, `Tpl*.dc.html`, `folio-lib.js` (fixtures, view model, validator), `Folio Workspace.dc.html` and `FolioWorkspaceApp.dc.html` (next to build), `shots/`. |
| `UX.md` | User journeys: one workspace where form, preview and design are views of the same document; how imports land; click-to-edit; saving; photos; direction. |
| `schema/` | The contract (`resume.schema.json`), its guide (`SCHEMA.md`) and fixtures (`examples/minimal.json`, `full.json`, `rtl.json`). |
| `prompts/` | `claude-design.md` (the design brief) and `ai-content.md` (the prompt users give a text model to get importable JSON). |

## How templates work

- A template is a React component taking a `ResumeView`. It switches on `section.kind` and renders what's there; empty and hidden sections never reach it.
- Sizes are CSS px on a 794 px wide A4 sheet (96 px per inch), copied from the design. Page margins (44 px block, 48 px inline) are padding on screen and the `@page` margin in print, so every printed page gets them.
- **Logical CSS only.** Templates and the page use `inline`/`block` and `start`/`end`; a test fails on any `left` or `right` in the CSS. That is what makes `rtl.json` mirror with no per-template code.
- Entries use `break-inside: avoid` and headings `break-after: avoid`, so a job or project moves to the next page whole.
- Colour comes from `--accent`, `--accent-soft` and `--on-accent` (white or near-black text on the accent, whichever passes 4.5:1).
- Links are real `<a href>`s (mail, phone, website, profiles, projects), so they work in the PDF.

## What the PDFs showed

Checked in headless Chromium through the real print path:

- Text is selectable and links are clickable. Arabic extracts correctly.
- `full.json` doesn't fit on one A4 page in Meridian (page 2 holds *Find me online*) or Ledger (a single line spills). The design canvas shows the same overflow (105% of A4 height for Meridian). The page reports it: *2 pages · page 2 is 12% full: trim a little to fit on 1*. Tracking fits on one page.
- Tracking's letter-spaced headline and headings extract as `S TA F F  F R O N T E N D`. Your original letter-spaced resume extracts the same way. People reading the PDF won't notice, but some ATS parsers may not recognise the section names. Ledger has no letter-spacing, so it is the safer pick for ATS.

## Decisions

- PDF through the browser's print dialog. Canvas libraries (html2canvas + jsPDF) make images of text and are ruled out.
- No accounts, no list of resumes. The downloaded JSON is the user's save; one working copy lives in `localStorage` (see `UX.md`).
- Photos are optional everywhere; `preferences.avatar` fills a photo slot with the photo, initials or nothing.

## Out of scope

Folio helps people make a good-looking resume from their content. It doesn't write or score content: no built-in AI, no job-description matching or keyword analysis, no ATS scoring. Content help comes from whatever AI the user already uses, through `prompts/ai-content.md`.

## Next steps

1. Build the workspace from `design/Folio Workspace.dc.html`: the form (*Content* tab), *Design* tab, live preview with click-to-edit (the `data-path`s are already on every element), import with the design's validator and fix hints, `localStorage` draft.
2. Templates 4–10, once designed.

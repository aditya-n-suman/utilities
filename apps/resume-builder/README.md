# Folio: resume builder

A client-only web app for making resumes. Fill in a form, or import a JSON file written by hand or by an AI chat, pick a template, download a PDF. Nothing is sent to a server.

Status: **working app.** The journeys in `UX.md` are built: Home (with *Welcome back* when a draft exists), *Start with the form*, *Import JSON* (valid, invalid or not JSON), and the workspace from `design/Folio Workspace.dc.html` with live preview, click-to-edit, problems panel, review banner, template gallery, focus preview, photo crop, autosave and *Fit on N pages*. Three templates are built (Meridian, Ledger, Tracking); seven more are designed in the brief but not yet in Claude Design.

| Screen | Route |
|---|---|
| Home | `#/` |
| Import JSON | `#/import` |
| Workspace | `#/edit` (opens the saved draft, or a blank form) |
| Template sheet (developer reference: every template from every fixture) | `#/templates` |

## Run, test, build

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # schema, validator, view model, paths, import, template render and CSS tests
npm run typecheck
npm run build      # static site in dist/, works from any folder
```

*Download PDF* opens the browser's print dialog; pick "Save as PDF" as the destination. The file name comes from `meta.title` (default `<name> - Resume`). It stays disabled (*Fix N problems to download*) while the document has validation errors.

## Code map

| Path | What |
|---|---|
| `src/app/App.tsx` | Screens and hash routes; opens the workspace from Home, Import or the saved draft. |
| `src/app/Home.tsx`, `ImportScreen.tsx` | Home (*Welcome back* / *Start fresh*, the two ways in, the AI explainer) and Import (drop, choose or paste; summary and template choice for a valid file; problem list with *Fix in the form* and *Copy errors for AI*; parse errors with line and column; replace-draft dialog). |
| `src/app/validate.ts` | Ajv against the schema, turned into one plain-language problem per field with a fix hint and a one-click fix where it can guess (`"Feb 2025"` → `2025-02`, missing `https://`). `prepareForForm()` takes out unknown keys and wrong-type values (reported as *Not imported*) and keeps every other invalid value in place for the form. |
| `src/app/storage.ts`, `ai.ts`, `files.ts` | The one `localStorage` draft; the AI prompt (built from `prompts/ai-content.md` plus the schema) and *Copy for AI*; JSON, schema and example downloads. |
| `src/app/workspace/Workspace.tsx` | Top bar, Content/Design tabs, problems panel, review banner, focus preview, dialogs, toasts with Undo, autosave (soon after the first change, flushed when the page is hidden), *Fit*. |
| `src/app/workspace/ContentTab.tsx`, `specs.ts`, `fields.tsx` | Section cards (drag or arrow keys to reorder, hide, rename), Basics, Skills, and every list section driven by a field spec, so each schema field has an input. Every input carries `data-field`. |
| `src/app/workspace/Preview.tsx`, `pathmap.ts` | Live page with hover outline (*Edit · Bullet 2*), click-to-edit, focused-field highlight, error markers and page-break guides; `pathmap` translates between preview `data-path`, form `data-field` and section cards. |
| `src/app/workspace/DesignTab.tsx`, `Gallery.tsx`, `CropDialog.tsx` | Template, accent, page size, date format, photo slot, skill levels, fit check with text size and spacing; the template gallery; the 600 × 600 photo crop. |
| `src/lib/paginate.ts` | `countPages()`: printed page count measured from the DOM, honouring `break-inside: avoid` per column. `findFit()`: the largest text, then spacing, that fits N pages. |
| `src/lib/paths.ts` | Immutable get/set/delete by dot path. |
| `src/lib/types.ts` | TypeScript view of the schema. Hand-written; keep it in step with `schema/resume.schema.json`. |
| `src/lib/view.ts` | `buildView(doc, opts)`: the only thing templates read. Formats dates and locations, parses markup, orders and hides sections, groups promotions, picks the avatar slot, splits main/side columns, and puts a `path` on every printed element for click-to-edit. Port of the design's `folio-lib.js` `view()`. |
| `src/lib/markup.tsx` | The schema's inline markup (`**bold**`, `*italic*`, `[label](https://…)`) to React. Everything else stays text. |
| `src/lib/format.ts` | Dates, ranges, locations, initials, accent contrast and tint. |
| `src/lib/print.tsx` | `printResume()`: renders the resume into a print-only root, sets `@page` size and margins, calls `print()`, cleans up on `afterprint`. |
| `src/templates/` | `registry.ts` (all 10 templates, 7 marked `soon`), `ResumePage.tsx` (the sheet: size, `dir`, `lang`, accent CSS variables), `Meridian`, `Ledger`, `Tracking` with their CSS, shared `parts.tsx`. |
| `src/pages/TemplatesPage.tsx` | The template sheet at `#/templates`: each template from `full.json` and `minimal.json` (alt accent), Ledger from `rtl.json`, Meridian's three avatar modes, page-break guides, page count and fit hint, page size, *Text size* and *Spacing* sliders. |
| `design/` | Claude Design export: `Folio Templates.dc.html`, `Tpl*.dc.html`, `folio-lib.js` (fixtures, view model, validator), `Folio Workspace.dc.html` and `FolioWorkspaceApp.dc.html` (the workspace this app implements), `shots/`. |
| `UX.md` | User journeys: one workspace where form, preview and design are views of the same document; how imports land; click-to-edit; saving; photos; direction. |
| `schema/` | The contract (`resume.schema.json`), its guide (`SCHEMA.md`) and fixtures (`examples/minimal.json`, `full.json`, `rtl.json`). |
| `prompts/` | `claude-design.md` (the design brief) and `ai-content.md` (the prompt users give a text model to get importable JSON). |

## How templates work

- A template is a React component taking a `ResumeView`. It switches on `section.kind` and renders what's there; empty and hidden sections never reach it.
- Sizes are CSS px on a 794 px wide A4 sheet (96 px per inch), copied from the design. Page margins (44 px block, 48 px inline) are padding on screen and the `@page` margin in print, so every printed page gets them.
- **Logical CSS only.** Templates and the page use `inline`/`block` and `start`/`end`; a test fails on any `left` or `right` in the CSS. That is what makes `rtl.json` mirror with no per-template code.
- Entries use `break-inside: avoid` and headings `break-after: avoid`, so a job or project moves to the next page whole.
- **Text size and spacing are user-adjustable.** Template CSS writes every size as a multiple of `--fs` (text, and what's sized with it: icons, the avatar, bullet indents) or `--sp` (margins, padding, gaps): `font-size: calc(11.7 * var(--fs))`. The page sets `--fs = 1px × textScale` and `--sp = 1px × spacingScale` from `preferences.textScale` (0.85–1.15) and `spacingScale` (0.5–1.5). Borders and page margins stay fixed. A test fails on any raw `px` size in template CSS. Not `rem`, because the root font size belongs to the app UI and the browser's font settings; not `em`, because spacing has to move independently of text, and nested `em` compounds.
- Colour comes from `--accent`, `--accent-soft` and `--on-accent` (white or near-black text on the accent, whichever passes 4.5:1).
- Links are real `<a href>`s (mail, phone, website, profiles, projects), so they work in the PDF.

## Page count and Fit

The preview, the fit check and *Fit on N pages* all use `countPages()`, which simulates print: a job, project or skill group moves to the next page whole, a heading stays with what follows, and Meridian's two columns flow separately. Checked against real Chromium PDFs for every template with `full.json`, `minimal.json` and a long resume, at text/spacing settings from 85%/50% to 115%/150%: 39 of 39 page counts match.

*Fit on N pages* keeps text as large as it can: it lowers spacing first (to 50%), then text (to 85%, about 7 pt body), and says so when even that isn't enough. Undo is in the toast.

## What the PDFs showed

Checked in headless Chromium through the real print path:

- Text is selectable and links are clickable. Arabic extracts correctly.
- `full.json` doesn't fit on one A4 page in Meridian (page 2 holds *Find me online*) or Ledger (a single line spills). The design canvas shows the same overflow (105% of A4 height for Meridian). The page reports it: *2 pages · page 2 is 12% full: trim a little to fit on 1*. Tracking fits on one page. At text 95% and spacing 60% both fit on one page (body text 7.8 pt in Meridian, 8.3 pt in Ledger), in the preview and the PDF.
- Tracking's letter-spaced headline and headings extract as `S TA F F  F R O N T E N D`. Your original letter-spaced resume extracts the same way. People reading the PDF won't notice, but some ATS parsers may not recognise the section names. Ledger has no letter-spacing, so it is the safer pick for ATS.

## Decisions

- PDF through the browser's print dialog. Canvas libraries (html2canvas + jsPDF) make images of text and are ruled out.
- No accounts, no list of resumes. The downloaded JSON is the user's save; one working copy lives in `localStorage` (see `UX.md`).
- Photos are optional everywhere; `preferences.avatar` fills a photo slot with the photo, initials or nothing.

## Out of scope

Folio helps people make a good-looking resume from their content. It doesn't write or score content: no built-in AI, no job-description matching or keyword analysis, no ATS scoring. Content help comes from whatever AI the user already uses, through `prompts/ai-content.md`.

## Where this departs from the design

- **Standard pages, not one tall page.** The workspace design made every PDF a single page as tall as the content. That gets shrunk when someone prints it on A4 or Letter, so Folio keeps real pages and adds *Fit on N pages*.
- **Every field is editable.** The design's list editors had two inputs each (e.g. School and Degree); dates, field of study, scores, links and so on are now all in the form, from `specs.ts`.
- **Required fields start quiet.** A brand-new form doesn't open in red: "required" errors show once a field has been visited or the person opens the problems. The PDF button counts them from the start.
- **Home, Import and the gallery** weren't in the design export; they follow `UX.md` and the workspace's visual language.

## Next steps

1. Templates 4–10: run the remaining part of `prompts/claude-design.md` in Claude Design, then build them like the first three.
2. Undo/redo for typing (today Undo covers deletes, Start over, Replace and Fit).
3. The designer's schema notes: a section key for profiles, and showing which column a section lands in when reordering in two-column templates (the *Sidebar* tag covers it for now).

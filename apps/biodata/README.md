# Biodata

An editable marriage biodata page: an ornate 1055×1491 sheet (gold frame, Ganesha, photo frame, peacocks, diya) with editable text on top. Click any text to change it, upload a photo into the frame, then print it or save it as a PDF.

Everything stays in the browser. Text, sizes and the photo are saved to `localStorage`, so edits survive a reload in the same browser but don't carry over to another browser or device.

## Use it

| | |
|---|---|
| **Text** | Click any text to edit it. Enter finishes a line (the preference paragraph keeps Enter for new lines). Long values wrap. |
| **Edit / Done editing** | Top-left toggle. Edit mode shows the panel and the on-page buttons: × on each row, + Row, + Section, ↑ (move section up), Remove section, Reset to original. With editing off the page looks exactly like the design. |
| **Text & spacing** | − / + for heading size, body size and line spacing (2% steps, 60–160%) and the gap between sections (10% steps, 0–300%). Text blocks stay anchored where the design put them, so very large text can run into the artwork. |
| **Photo** | Upload, zoom 50–400%, pan with the arrows (10px) or by dragging the photo, scroll on the photo to zoom. • re-centres it. Uploads are shrunk to 1600px JPEG so they fit in storage. |
| **Type** | Noto Serif or PT Serif, and heading and text colours (presets or any colour). |
| **Print / PDF** | Prints only the page, at 1055×1491px with no margins. Choose *Save as PDF* as the printer to get a file. |

## Background artwork

The artwork is one image, `public/background.png` (1055×1491), from the Claude Design export with the text areas removed. **It isn't committed**, because the frame still contains the original photo. Put the file there before running or building. Without it the page shows a plain parchment colour, and everything else still works.

## Run, test, build

```bash
cd apps/biodata
npm install
npm test          # document/state tests (vitest)
npm run dev       # http://localhost:5173
npm run build     # static site in dist/ (relative paths, host it anywhere)
```

## Code map

```
design/Biodata.dc.html  the approved Claude Design canvas (sample text in place of real details)
public/background.png   artwork (not committed, see above)
src/
  App.tsx               state, saving, fit-to-width scaling, photo upload
  doc.ts                document model, placeholder content, measured section metrics, size/zoom limits
  settings.ts           font and colours (saved apart, so "Reset to original" keeps them)
  photo.ts              shrink uploads before storing
  components/
    Page.tsx            the 1055×1491 sheet; every position comes from the canvas
    Panel.tsx           floating controls (text & spacing, photo, type, print)
    Editable.tsx        click-to-edit text that commits on blur
  assets/fonts/         self-hosted Noto Serif, Noto Serif Devanagari, PT Serif (variable width)
```

## Matching the design

Rendered with the canvas's original text, the page matches `design/Biodata.dc.html` pixel for pixel in headless Chromium. The only difference is the floating toolbar, which isn't part of the page. Narrow windows scale the whole page down to fit instead of reflowing it.

# Folio: resume builder (planning)

A client-only web app for making resumes. Fill in a form, or import a JSON file written by hand or by an AI chat, pick a template, download a PDF. Nothing is sent to a server.

Status: **design and contract stage.** No app code yet.

| Path | What |
|---|---|
| `UX.md` | User journeys: one workspace where form, preview and design are views of the same document; how imports (valid or not) land; click-to-edit. |
| `schema/resume.schema.json` | The data contract (JSON Schema 2020-12). Form, importer and templates all use it. |
| `schema/SCHEMA.md` | Human guide to the contract: rules, choices, import behaviour, versioning. |
| `schema/examples/` | `minimal.json`, `full.json` and `rtl.json` (Arabic). Fictional people; all validate. They are the fixtures every template must render. |
| `prompts/claude-design.md` | Prompt for Claude Design: 4 app screens (workspace, import, gallery, home) and 10 resume templates (3 from the owner's reference resumes). |
| `prompts/ai-content.md` | Prompt the app hands users to get schema-valid JSON out of any text model. |

## Planned architecture

- React + Vite + TypeScript, like `apps/nginx-config-explorer`.
- Types generated from the schema; validation with Ajv in the browser (schema compiled at build time to keep the bundle small).
- No accounts, no list of resumes. The downloaded JSON is the user's save. One working copy lives in `localStorage` so a reload or a later visit can continue; on return the user chooses *Continue* or *Start fresh* (which deletes it). Photos are downscaled on upload to keep that copy small. Details in `UX.md`.
- Layout uses logical CSS properties only, so right-to-left resumes mirror without per-template code. Direction comes from `meta.locale` / `meta.direction`.
- Photos are optional everywhere. Some templates have a photo slot; `preferences.avatar` fills it with the photo, initials or nothing.
- Templates are React components that receive the normalised document and an accent token. Each ships a `meta` (id, name, tags, ATS-safe, honoured preferences).
- PDF: decided. Render the chosen template into a print-only iframe with `@page` CSS and call `print()`; the user saves through the browser's print dialog. The PDF keeps real, selectable text, which ATS parsers need. Canvas-based libraries (html2canvas + jsPDF) produce images of text and are ruled out.

## Out of scope

Folio helps people make a good-looking resume from their content. It doesn't write or score content: no built-in AI, no job-description matching or keyword analysis, no ATS scoring. Content help comes from whatever AI the user already uses, through `prompts/ai-content.md`.

## Validate the examples

```bash
python3 -m pip install jsonschema   # once
python3 - <<'PY'
import json; from jsonschema import Draft202012Validator, FormatChecker
s = json.load(open("schema/resume.schema.json"))
for f in ["minimal", "full", "rtl"]:
    Draft202012Validator(s, format_checker=FormatChecker()).validate(json.load(open(f"schema/examples/{f}.json")))
print("ok")
PY
```

This becomes an `npm test` once the app exists.

## Next steps

1. Run `prompts/claude-design.md` in Claude Design with `UX.md`, the schema, examples and reference resumes attached. Save the approved canvases under `design/`.
2. Scaffold the Vite app, generate types, wire Ajv import with friendly error messages.
3. Build templates 1–3 (the reference ones) first, then the form editor, then the rest.

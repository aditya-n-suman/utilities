# Resume builder (planning)

A client-only web app for making resumes. Fill in a form, or import a JSON file written by hand or by an AI chat, pick a template, download a PDF. Nothing is sent to a server.

Status: **design and contract stage.** No app code yet. "Folio" in the design prompt is a working name.

| Path | What |
|---|---|
| `schema/resume.schema.json` | The data contract (JSON Schema 2020-12). Form, importer and templates all use it. |
| `schema/SCHEMA.md` | Human guide to the contract: rules, choices, import behaviour, versioning. |
| `schema/examples/` | `minimal.json` and `full.json`. Fictional people; both validate. They are the fixtures every template must render. |
| `prompts/claude-design.md` | Prompt for Claude Design: 5 app screens and 10 resume templates (3 from the owner's reference resumes). |
| `prompts/ai-content.md` | Prompt the app hands users to get schema-valid JSON out of any text model. |

## Planned architecture

- React + Vite + TypeScript, like `apps/nginx-config-explorer`.
- Types generated from the schema; validation with Ajv in the browser (schema compiled at build time to keep the bundle small).
- Draft autosaved in `localStorage` (IndexedDB if photos make it large).
- Templates are React components that receive the normalised document and an accent token. Each ships a `meta` (id, name, tags, ATS-safe, honoured preferences).
- PDF: render the chosen template into a print-only iframe with `@page` CSS and call `print()`. The browser's PDF has real, selectable text, which ATS parsers need. Canvas-based libraries (html2canvas + jsPDF) produce images of text and are ruled out. `@react-pdf/renderer` would give one-click download without the print dialog, at the cost of writing every template twice (it doesn't use HTML/CSS); kept as a fallback if the print dialog proves too clumsy.

## Validate the examples

```bash
python3 -m pip install jsonschema   # once
python3 - <<'PY'
import json; from jsonschema import Draft202012Validator, FormatChecker
s = json.load(open("schema/resume.schema.json"))
for f in ["minimal", "full"]:
    Draft202012Validator(s, format_checker=FormatChecker()).validate(json.load(open(f"schema/examples/{f}.json")))
print("ok")
PY
```

This becomes an `npm test` once the app exists.

## Next steps

1. Run `prompts/claude-design.md` in Claude Design with the schema, examples and reference resumes attached. Save the approved canvases under `design/`.
2. Scaffold the Vite app, generate types, wire Ajv import with friendly error messages.
3. Build templates 1–3 (the reference ones) first, then the form editor, then the rest.

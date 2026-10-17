# Resume JSON contract (v1.0)

`resume.schema.json` (JSON Schema 2020-12) is the single contract between the form editor, the JSON import, every template and any AI that writes content. The form produces it, the import accepts it, the templates read only it.

Examples: [`examples/minimal.json`](examples/minimal.json) (the least a useful resume needs), [`examples/full.json`](examples/full.json) (every section and field) and [`examples/rtl.json`](examples/rtl.json) (Arabic, right to left). All validate.

## Design rules

1. **Content, not looks.** The JSON says what the resume says. Fonts, columns and colours belong to the template. The one exception is `preferences`, a small set of hints (template, accent colour, page size, section order, titles) that templates may ignore.
2. **Strict, so mistakes surface.** Every object has `additionalProperties: false`, so a typo like `"emial"` is an error with a path, not a silently missing field. Put your own data under keys starting with `x-` (allowed on the root, `meta`, `basics`, `preferences`, and work, education and project items). Templates never read `x-` keys.
3. **Easy for a text model to write.** Flat, predictable keys. Strings wherever possible: a bullet can be a plain string, a skill can be a plain string. Objects are optional upgrades (`{label, text}` bullets, `{name, level}` skills).
4. **Dates are partial ISO strings, formatted at render time.** `"2025"`, `"2025-02"` or `"2025-02-14"`. `endDate: "present"` means ongoing. Templates format with `preferences.dateFormat` (default `MMM YYYY` → *Feb 2025*) and `meta.locale`.
5. **Limits are generous but real.** Max lengths (200 chars for a line, 500 for a bullet, 1500 for a paragraph) and max counts (12 bullets per job) stop runaway AI output without getting in the way of a normal resume.

## Inline markup

`summary`, `description`, bullet text and other paragraph fields accept exactly three things:

| Markup | Renders as |
|---|---|
| `**text**` | bold |
| `*text*` | italic |
| `[label](https://url)` | link (http, https and mailto only) |

Everything else is text. HTML tags are escaped and shown literally, so pasted content can't inject markup into the page or the PDF.

## Top level

| Key | Required | What |
|---|---|---|
| `schemaVersion` | yes | `"1.0"`. |
| `basics` | yes | Name (required), headline, photo or initials, email, phone, location, website, profiles, summary, extras. |
| `meta` | | Locale, text direction, document title (PDF title and filename), lastModified, generator. |
| `work` | | Jobs, newest first. |
| `education` | | Degrees and schools. |
| `skills` | | Skill groups with items. |
| `projects` | | Side projects, open source, packages. |
| `certifications`, `awards`, `publications`, `languages`, `volunteer`, `interests` | | As named. |
| `references` | | `{ "availableOnRequest": true }` or a list of referees. |
| `customSections` | | Anything else (Talks, Patents, Leadership), each with a `display` mode. |
| `preferences` | | Presentation hints. |

The full field list, with descriptions, lives in the schema. Editors that understand JSON Schema (VS Code, JetBrains) autocomplete it when the file starts with `"$schema": "./resume.schema.json"` or the published URL.

## Choices worth knowing

**Promotions are separate `work` entries with the same `company`.** That keeps each entry flat and simple for a model to write. Templates that want the *Company → role, role* layout group consecutive entries whose `company` matches.

**`context` carries the client or product.** Consultancies and agencies list *Publicis Sapient | Client: US Bank*. Product teams list *InfoEdge | Shiksha.com*. Both go in `context`, printed after the company.

**Bullets can have a bold lead-in.** `{ "label": "Core Web Vitals", "text": "Improved INP by 5%..." }` renders as **Core Web Vitals:** Improved INP by 5%... A plain string is just a bullet. Don't put the colon in `label`.

**Skills can have levels, but most templates don't show them.** Levels (1–5) are drawn only when the template supports it and `preferences.showSkillLevels` is true. Bars on a resume are often read as self-rating noise, so it's opt-in.

**Photo, initials or nothing.** A photo is always optional, also in templates designed with a photo slot. `basics.photo.src` takes a `data:image/...;base64,` URI (preferred: works offline and survives PDF export) or an https URL that allows CORS. `preferences.avatar` decides what a slot shows: `auto` (photo, else initials), `initials`, or `none` (the slot disappears and the header reflows). Initials come from `basics.initials`, else the first letters of the first two words of `name`.

**Any language, either direction.** `meta.locale` sets date formatting and `meta.direction` (derived from the locale when omitted) sets `dir` on the page. Templates are written with logical CSS properties only (`margin-inline-start`, `inset-inline-end`, `text-align: start`, `border-block-end`), so a right-to-left resume mirrors correctly with no per-template work. Section headings default to English; set `preferences.sectionTitles` for other languages. See [`examples/rtl.json`](examples/rtl.json).

**Text size and spacing.** `preferences.textScale` (0.85–1.15) and `spacingScale` (0.5–1.5) let a user tighten or loosen any template without changing it: text and what's sized with it (icons, avatar, bullet indents) follow `textScale`; margins, padding and gaps between and inside sections follow `spacingScale`. Page margins, borders and rules don't change. The preview and the PDF use the same values, so what fits on screen fits on paper.

**`x-notes`: open questions from an AI.** Not a schema field, a convention between `prompts/ai-content.md` and the app: an AI that writes the JSON lists facts it couldn't confirm in a top-level `"x-notes": ["…", "…"]` (an array of strings). After an import the app shows them as a checklist in the review banner. Like every `x-` key it's ignored by templates and kept on export.

**Section keys** are used by `preferences.sectionOrder`, `hiddenSections` and `sectionTitles`: `summary`, `work`, `education`, `skills`, `projects`, `certifications`, `awards`, `publications`, `languages`, `volunteer`, `interests`, `references`, and `custom:<id>` for a custom section.

**Empty sections don't render.** A missing key, an empty array and a hidden section all produce no heading.

## What the app does on import

1. Parse. A JSON syntax error shows the line and column.
2. Validate against the schema. Errors list the JSON path (`work[0].startDate`), the problem and a fix hint (*use "2025-02", not "Feb 2025"*).
3. If it is valid, normalise and open the workspace on the rendered resume. If it isn't, the user can still load it into the form: everything that fits a form field is loaded, invalid values stay in their field flagged as errors, and unknown keys are listed as not imported. PDF export waits until the document is valid. See `../UX.md`.
4. Normalise for templates: generate missing `id`s, turn string bullets into `{ text }`, turn string skills into `{ name }`, derive initials, sort nothing (order is the author's).
5. Templates receive only the normalised document. Export writes it back in the same shape, keeping `x-` keys untouched, so a file survives import → edit → export → AI → import.

## Versioning

`schemaVersion` is `major.minor`. A minor version only adds optional fields, so a `1.0` document stays valid under `1.x`. A major version may rename or remove fields, and the app will ship a migration for each older major it still accepts.

## Prior art

Close in spirit to [JSON Resume](https://jsonresume.org/schema), with these differences: `schemaVersion` and strict validation, partial ISO dates plus `"present"`, `{label, text}` bullets, `context` and `workMode` on work, structured `score` on education, `{name, level}` skills, `customSections` with display modes, and a separate `preferences` block. An importer for JSON Resume files is a reasonable later addition.

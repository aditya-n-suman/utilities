# Prompt for Claude Design

Paste everything below the line into Claude Design. Attach:

- `UX.md` (the user journeys)
- `schema/resume.schema.json` and `schema/SCHEMA.md` (the data contract)
- `schema/examples/full.json`, `minimal.json` and `rtl.json` (the fixtures templates render)
- Your reference resumes (images or PDFs). The prompt names three of them as templates 1–3; rename or add to match what you attach.

---

## Project

Design **Folio**, a resume builder that runs entirely in the browser. No account, no server: the resume is built and exported to PDF on the user's device. The user keeps their work by downloading the JSON; the browser holds one working copy for convenience (see `UX.md`, *Saving*).

There are two ways in, and both end at the same place:

1. **Build with the form.** Fill in a guided form; the app builds a JSON document as you type.
2. **Bring your own JSON.** Upload (or paste) a JSON file that follows our published schema. This is for people who write their content with an AI chat (ChatGPT, Claude, Gemini) or by hand. The app gives them a ready-made prompt to paste into the AI and a link to the schema. They only need a text model for the words; Folio does the design.

Either way, the user then picks a template, sees their resume rendered live, adjusts a few things (accent colour, page size, section order) and downloads a PDF.

The form is never a step people must pass, and never out of reach. Form, preview and design controls are views of one document in one **workspace**, and any part of the preview is one click from its form field. An imported file lands on the rendered resume, not the form, with a short review banner. The attached `UX.md` describes the journeys; follow it, and flag anything in it that doesn't work as a design.

The data contract is attached (`resume.schema.json`, explained in `SCHEMA.md`). Every field the form collects, every field a template prints and every error the importer shows must map to it. Don't invent fields; if a design needs one, call it out in a note on the canvas.

## Part 1: the web app

### Audience and tone

Job seekers from students to senior engineers, many on a laptop, some on a phone. They're often anxious and in a hurry. The app should feel calm, competent and quick: a good tool, not a marketing site. The resume is the hero; the chrome stays quiet.

### Visual direction

- A neutral, light-first UI (with a dark mode) so any template's colours read correctly next to it.
- One restrained brand accent for primary actions only.
- A clean sans for UI (e.g. Inter, IBM Plex Sans or similar from Google Fonts). Templates bring their own fonts.
- Generous whitespace, 8 px spacing grid, clear focus states, WCAG AA contrast.
- Desktop 1440 px first, plus a 390 px phone version of each screen.

### Screens

Design each as its own canvas.

1. **Home.** One line on what Folio does and that nothing leaves the device. Two equal, obvious choices: *Start with the form* and *Import JSON*. A strip of template thumbnails below. A small *Resume with AI* explainer: three steps (copy our prompt → paste it into any AI with your old resume → import the JSON it gives back). On a return visit with a saved copy, a *Welcome back* choice comes first: *Continue where you left off* (primary) or *Start fresh* (deletes the saved copy after a confirm that offers *Download JSON first*).

2. **Workspace** (the main screen; see `UX.md`). Left panel with two tabs, *Content* (the form) and *Design*; live A4 preview on the right that updates as you type. Top bar: document name, *Saved in this browser* status, problems icon, *Copy for AI*, *Download JSON*, *Download PDF*. A document menu holds *Start over* and *Remove from this browser*. The save status tooltip says the copy lives only in this browser.
   - **Click to edit.** Hovering any part of the preview outlines it with an *Edit* hint; clicking opens *Content* at that exact field (down to a single bullet) and focuses it. Focusing a form field highlights its element in the preview. Show both directions.
   - *Content* tab: sections as a vertical list the user can reorder by drag, collapse, hide and rename (these map to `preferences.sectionOrder`, `hiddenSections`, `sectionTitles`).
     - *Basics*: name, headline, photo upload with crop (or initials fallback), email, phone, location, website, profiles (network picker with icons), summary.
     - *Experience* as repeatable cards: company, title, context, dates with a *Present* toggle, location + work mode, bullets. Each bullet can have an optional bold lead-in label. Reorder bullets and entries by drag. Duplicate an entry (for promotions).
     - *Skills* as groups of chips, typed with Enter, optional level per chip.
     - An *Add section* menu for the optional sections and *Custom section*.
     - Field help text, character counters near the limits, inline validation.
     - The tiny markup supported in text fields (bold, italic, link) via a minimal toolbar or shortcuts, not a full rich-text editor.
   - *Design* tab: current template with *Browse all templates*, accent colour (6 presets + custom), page size A4 / Letter, date format, photo slot (*Photo · Initials · None*, shown only for templates with a slot), show skill levels, *Text size* (85–115%) and *Spacing* (50–150%) sliders with the printed body size beside them. A *Fit check* that warns when the resume runs to a mostly empty extra page.
   - **Review banner** after a valid import: what was imported, *Review content*, the AI's notes (`x-notes`) as a checklist, and a few soft warnings (no phone, a job with no bullets). Dismissible, reopens from the problems icon.
   - **Problems panel** after an import with errors: each error clickable to its field; bad values stay visible in their field, flagged; keys that couldn't be imported listed separately. *Download PDF* reads *Fix 2 problems to download* while errors remain.
   - **Focus preview**: full-screen paged preview (page breaks visible, page count) with an *Edit* button; click-to-edit still works and brings the panel back. A one-line note that the PDF keeps real, selectable text (good for ATS).
   - Phone: one pane at a time with a bottom bar *Content · Design · Preview*; tapping an element in Preview opens Content at that field, and a *Back to preview* chip returns to the same spot.
   Show the workspace in four states: building from scratch, just imported (review banner), imported with errors (problems panel), and focus preview.

3. **Import JSON.** Drop zone + *Choose file* + *Paste JSON*. States:
   - *Valid*: summary of what was found (name, 3 jobs, 2 projects, 4 skill groups), then *Choose a template* (primary) or *Skip, use the default*.
   - *Invalid*: list of errors, each with the JSON path, a plain-language problem and a fix hint (e.g. `work[0].startDate`: "Feb 2025" isn't a date we understand. Use "2025-02"). Primary *Fix in the form* (loads everything it can into the workspace with the problems panel open); secondary *Copy errors for AI* (copies the list so the user can paste it back to their AI).
   - *Not JSON*: the parse error with line and column.
   - *Replace your current resume?* dialog when a draft exists, offering *Download current JSON first*, then an *Undo* toast after replacing.
   Also on this screen: *Get the AI prompt* (copy button, shows a preview of the prompt), *Download schema*, *Download example JSON*.

4. **Template gallery.** Opened after an import and from *Browse all templates*. Grid of the templates rendered with the user's own data, not lorem ipsum. Filters: *ATS-friendly*, *One column / Two column*, *Photo slot*, *Style* (classic, modern, creative, academic). Each card: name, tags, page count with the user's data. Hover or tap for a larger preview. Selecting one returns to the workspace with it applied; an *Edit content* link is always present.

Also design: empty states, the *Welcome back* prompt, the *Not saved in this browser* status, a destructive-action confirm (*Start over*), toast styles, and the error banner when a PDF export fails.

## Part 2: resume templates

Design **10 templates**. Templates are what click-to-edit wraps, so every printed element must correspond to one schema field (or one list item). Each one renders `full.json` on A4. Also show `minimal.json` for each, so we can see a short resume still looks intentional, and a page-2 continuation so we can see how a long one breaks.

### Rules every template follows

- **Print-real.** Page = A4 (210 × 297 mm) with a Letter (8.5 × 11 in) variant. Margins ≥ 12 mm. Body text 9–11 pt, nothing under 8 pt. Must look right in black-and-white print.
- **Multi-page.** Entries (a job, a project) never split across pages unless one is taller than a page. Headings never sit alone at the bottom of a page. Two-column templates say what happens on page 2 (sidebar continues, or main column spans full width).
- **Text, not pictures.** Everything is live text built from HTML/CSS, so the PDF is selectable and parsable. No text in images. Icons are simple inline SVG and always have a text equivalent next to them.
- **Photo is optional, always.** Templates with a photo slot (marked below) must look designed in all three `preferences.avatar` modes: photo, initials, and none (slot removed, header reflows). Templates without a slot ignore the photo.
- **Either direction.** Build with logical CSS properties only (`margin-inline-start`, `padding-block`, `inset-inline-end`, `text-align: start`, `border-inline-start`), never left/right, so `dir="rtl"` mirrors the layout: sidebars swap sides, dates move to the other edge, bullets and icons flip where they should (numbers and Latin tech names stay LTR inside RTL text). Pick fonts with a fallback stack that covers Arabic and Hebrew (e.g. Noto Sans Arabic, Noto Sans Hebrew).
- **Driven by the schema.** Annotate each template with which schema field fills each element. Show how it handles: missing optional fields (no headline; no location; no profiles), `endDate: "present"`, bullets with and without a `label`, consecutive `work` entries at the same company (grouped or not, your call per template), `context`, `workMode`, skill groups with and without names, skill levels when `showSkillLevels` is on, `customSections` in each `display` mode, and `sectionTitles` overrides.
- **Customisable within limits.** One accent colour token (from `preferences.accentColor`) drives every coloured element; show each template in its default accent and one alternative. Fonts are fixed per template, from Google Fonts.
- **ATS rating.** Tag each as *ATS-safe* (single column, standard headings, plain reading order) or *Visual* (columns, sidebars, graphics).

### The templates

From the attached references (match them closely; they're the user's own and already proven):

1. **Meridian** · photo slot (reference: the two-column image resume). Large bold name, accent-coloured headline, contact row with small icons, a round accent circle with initials (or photo) top right. Left column: Summary, Experience. Right column: Education with a GPA block, Skills as underlined chips grouped under accent sub-headings, Projects, Find me online. Section headings in caps with a thick black rule.
2. **Ledger** (reference: the single-column PDF with *InfoEdge | Lead Engineer (Frontend)* lines). Classic, centred name, one contact line separated by pipes, `Company | Title` then `Location | Dates` lines, bullets with bold lead-in labels, skills as `Group: a, b, c` bullets. ATS-safe.
3. **Tracking** (reference: the PDF with letter-spaced headings). Centred name, a letter-spaced caps tagline (headline), letter-spaced section headings, skills as a two-column label/value table, role lines with title, company and context on the left and dates right-aligned. ATS-safe.

New designs (vary them meaningfully):

4. **Harbor** · photo slot. Coloured full-height sidebar (accent background, white text) with photo, contact, skills, languages, education; white main column with summary, experience, projects. Visual.
5. **Editorial**. Serif display name, small caps headings, hairline rules, generous leading. For writers, designers, consultants. ATS-safe.
6. **Timeline** · photo slot (small, beside the name). Experience on a vertical line with dots and dates in a left gutter; compact skill tags at the top. Visual.
7. **Compact**. Dense two-page-saver for senior people with long histories: 9 pt, tight spacing, dates in a narrow right column, technologies inline after each role. ATS-safe.
8. **Mono**. For developers: monospace headings, terminal-like subtle accents, skills shown as tags, GitHub/npm links prominent. Still professional, not gimmicky.
9. **Academic CV**. Multi-page by design: education first, publications with the owner's name bolded among authors, talks (custom section), awards, references listed. ATS-safe.
10. **Banner** · photo slot. A full-width accent header band with name, headline and contact; below it, a two-column body with a narrow left column for skills and education. Visual.

For each template, deliver: the A4 render of `full.json` (all pages), the render of `minimal.json`, for photo-slot templates the header in all three avatar modes, a thumbnail (for the gallery), the field annotations, and a short spec: fonts and sizes, colour tokens, spacing scale, column widths, page-break behaviour, which sections go where, and which `preferences` it honours.

## Deliverables summary

- 4 app screens × (desktop + phone), with the workspace in its four states, plus the states listed.
- 10 templates as above (4 with a photo slot, 6 without), plus Harbor and Ledger rendered from `rtl.json` to show right-to-left.
- A one-page design-token sheet for the app (colours, type scale, spacing, radii, shadows) and one shared template token sheet (accent, ink, muted ink, rule colour, page margins).
- Keep everything buildable with plain HTML and CSS (CSS grid, flex, `@page`, `break-inside: avoid`). The templates will be implemented as React components that print to PDF through the browser.

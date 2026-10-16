# Prompt for Claude Design

Paste everything below the line into Claude Design. Attach:

- `schema/resume.schema.json` and `schema/SCHEMA.md` (the data contract)
- `schema/examples/full.json` and `schema/examples/minimal.json` (the fixtures every template renders)
- Your reference resumes (images or PDFs). The prompt names three of them as templates 1–3; rename or add to match what you attach.

---

## Project

Design **Folio**, a resume builder that runs entirely in the browser. No account, no server: the resume is built, stored (in the browser) and exported to PDF on the user's device.

There are two ways in, and both end at the same place:

1. **Build with the form.** Fill in a guided form; the app builds a JSON document as you type.
2. **Bring your own JSON.** Upload (or paste) a JSON file that follows our published schema. This is for people who write their content with an AI chat (ChatGPT, Claude, Gemini) or by hand. The app gives them a ready-made prompt to paste into the AI and a link to the schema. They only need a text model for the words; Folio does the design.

Either way, the user then picks a template, sees their resume rendered live, adjusts a few things (accent colour, page size, section order) and downloads a PDF.

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

1. **Home.** One line on what Folio does and that nothing leaves the device. Two equal, obvious choices: *Start with the form* and *Import JSON*. A strip of template thumbnails below. A small *Resume with AI* explainer: three steps (copy our prompt → paste it into any AI with your old resume → import the JSON it gives back). If a draft exists in the browser, a *Continue editing* card comes first.

2. **Form editor with live preview.** Split view: form on the left (~45%), live A4 preview on the right that updates as you type. Sections as a vertical list the user can reorder by drag, collapse, hide and rename (these map to `preferences.sectionOrder`, `hiddenSections`, `sectionTitles`). Show:
   - *Basics*: name, headline, photo upload with crop (or initials fallback), email, phone, location, website, profiles (network picker with icons), summary.
   - *Experience* as repeatable cards: company, title, context, dates with a *Present* toggle, location + work mode, bullets. Each bullet can have an optional bold lead-in label. Reorder bullets and entries by drag. Duplicate an entry (for promotions).
   - *Skills* as groups of chips, typed with Enter, optional level per chip.
   - An *Add section* menu for the optional sections and *Custom section*.
   - Field help text, character counters near the limits, inline validation.
   - The tiny markup supported in text fields (bold, italic, link) via a minimal toolbar or shortcuts, not a full rich-text editor.
   - Top bar: document name, *Saved in this browser* status, *Export JSON*, *Choose template*, *Download PDF*.
   - Phone: form only, with a *Preview* button that opens the preview full-screen.

3. **Import JSON.** Drop zone + *Choose file* + *Paste JSON*. Three states:
   - *Valid*: summary of what was found (name, 3 jobs, 2 projects, 4 skill groups) and *Continue to templates*.
   - *Invalid*: list of errors, each with the JSON path, a plain-language problem and a fix hint (e.g. `work[0].startDate`: "Feb 2025" isn't a date we understand. Use "2025-02"). Offer *Open in editor anyway* (loads what's valid, flags the rest) and *Copy errors for AI* (copies the list so the user can paste it back to their AI to fix).
   - *Not JSON*: the parse error with line and column.
   Also on this screen: *Get the AI prompt* (copy button, shows a preview of the prompt), *Download schema*, *Download example JSON*.

4. **Template gallery.** Grid of the templates rendered with the user's own data, not lorem ipsum. Filters: *ATS-friendly*, *One column / Two column*, *Photo*, *Style* (classic, modern, creative, academic). Each card: name, tags, page count with the user's data. Hover or tap for a larger preview. Selecting one opens the preview.

5. **Preview and export.** Large paged preview (page breaks visible, page count shown). Side panel: template switcher (thumbnails), accent colour (6 presets + custom), page size A4 / Letter, date format, show photo, show skill levels, section order. A *Fit check* that warns when the resume runs to a mostly empty extra page. *Download PDF* as the primary action, *Export JSON* secondary. A one-line note that the PDF keeps real, selectable text (good for ATS).

Also design: empty states, the autosave/restore prompt, a destructive-action confirm (*Start over*), toast styles, and the error banner when a PDF export fails.

## Part 2: resume templates

Design **10 templates**. Each one renders `full.json` on A4. Also show `minimal.json` for each, so we can see a short resume still looks intentional, and a page-2 continuation so we can see how a long one breaks.

### Rules every template follows

- **Print-real.** Page = A4 (210 × 297 mm) with a Letter (8.5 × 11 in) variant. Margins ≥ 12 mm. Body text 9–11 pt, nothing under 8 pt. Must look right in black-and-white print.
- **Multi-page.** Entries (a job, a project) never split across pages unless one is taller than a page. Headings never sit alone at the bottom of a page. Two-column templates say what happens on page 2 (sidebar continues, or main column spans full width).
- **Text, not pictures.** Everything is live text built from HTML/CSS, so the PDF is selectable and parsable. No text in images. Icons are simple inline SVG and always have a text equivalent next to them.
- **Driven by the schema.** Annotate each template with which schema field fills each element. Show how it handles: missing optional fields (no photo → initials or nothing; no headline; no location), `endDate: "present"`, bullets with and without a `label`, consecutive `work` entries at the same company (grouped or not, your call per template), `context`, `workMode`, skill groups with and without names, skill levels when `showSkillLevels` is on, `customSections` in each `display` mode, and `sectionTitles` overrides.
- **Customisable within limits.** One accent colour token (from `preferences.accentColor`) drives every coloured element; show each template in its default accent and one alternative. Fonts are fixed per template, from Google Fonts.
- **ATS rating.** Tag each as *ATS-safe* (single column, standard headings, plain reading order) or *Visual* (columns, sidebars, graphics).

### The templates

From the attached references (match them closely; they're the user's own and already proven):

1. **Meridian** (reference: the two-column image resume). Large bold name, accent-coloured headline, contact row with small icons, a round accent circle with initials (or photo) top right. Left column: Summary, Experience. Right column: Education with a GPA block, Skills as underlined chips grouped under accent sub-headings, Projects, Find me online. Section headings in caps with a thick black rule.
2. **Ledger** (reference: the single-column PDF with *InfoEdge | Lead Engineer (Frontend)* lines). Classic, centred name, one contact line separated by pipes, `Company | Title` then `Location | Dates` lines, bullets with bold lead-in labels, skills as `Group: a, b, c` bullets. ATS-safe.
3. **Tracking** (reference: the PDF with letter-spaced headings). Centred name, a letter-spaced caps tagline (headline), letter-spaced section headings, skills as a two-column label/value table, role lines with title, company and context on the left and dates right-aligned. ATS-safe.

New designs (vary them meaningfully):

4. **Harbor**. Coloured full-height sidebar (accent background, white text) with photo, contact, skills, languages, education; white main column with summary, experience, projects. Visual.
5. **Editorial**. Serif display name, small caps headings, hairline rules, generous leading. For writers, designers, consultants. ATS-safe.
6. **Timeline**. Experience on a vertical line with dots and dates in a left gutter; compact skill tags at the top. Visual.
7. **Compact**. Dense two-page-saver for senior people with long histories: 9 pt, tight spacing, dates in a narrow right column, technologies inline after each role. ATS-safe.
8. **Mono**. For developers: monospace headings, terminal-like subtle accents, skills shown as tags, GitHub/npm links prominent. Still professional, not gimmicky.
9. **Academic CV**. Multi-page by design: education first, publications with the owner's name bolded among authors, talks (custom section), awards, references listed. ATS-safe.
10. **Banner**. A full-width accent header band with name, headline and contact; below it, a two-column body with a narrow left column for skills and education. Visual.

For each template, deliver: the A4 render of `full.json` (all pages), the render of `minimal.json`, a thumbnail (for the gallery), the field annotations, and a short spec: fonts and sizes, colour tokens, spacing scale, column widths, page-break behaviour, which sections go where, and which `preferences` it honours.

## Deliverables summary

- 5 app screens × (desktop + phone), plus the states listed.
- 10 templates as above.
- A one-page design-token sheet for the app (colours, type scale, spacing, radii, shadows) and one shared template token sheet (accent, ink, muted ink, rule colour, page margins).
- Keep everything buildable with plain HTML and CSS (CSS grid, flex, `@page`, `break-inside: avoid`). The templates will be implemented as React components that print to PDF through the browser.

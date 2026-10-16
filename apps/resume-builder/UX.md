# UX and user journeys

## The principle

There is one resume document and one place to work on it: the **workspace**. The form, the preview and the design controls are views of the same document, not steps in a wizard. Whichever way someone arrives (typing, uploading JSON, coming back tomorrow), the form is always one click away, and nothing makes them go through it.

## Why the form isn't mandatory after an import

People who import JSON chose that path to skip typing. Forcing them through a long form they've already filled (in effect) adds friction and makes the import feel pointless. What they do need is a quick check of what the AI wrote, and an easy way to fix one line. So an import:

- lands on the resume itself (the fastest proof it worked),
- shows a short review banner with anything that needs attention,
- makes every part of the preview clickable to edit,

and the full form sits in a tab next to it.

The exception is a file with errors. That one opens on the form with the problems highlighted, because the form is where they get fixed.

## The workspace

```
┌──────────────────────────────────────────────────────────────────────┐
│ Priya Raman – Resume   ✓ Saved in this browser    [Export JSON] [PDF]│
├───────────────────────────────┬──────────────────────────────────────┤
│ [ Content ] [ Design ]        │                                      │
│                               │        live A4 preview               │
│  Content: the form            │        (click any part to edit it)   │
│  Design: template, accent,    │                                      │
│  page size, date format,      │                                      │
│  section order, photo, levels │                                      │
│                               │                                      │
├───────────────────────────────┴──────────────────────────────────────┤
│ review banner / problems panel (when there is something to show)     │
└──────────────────────────────────────────────────────────────────────┘
```

- **Left panel, two tabs.** *Content* is the form. *Design* holds the template switcher (with *Browse all templates*, which opens the gallery) and every `preferences` control. Switching tabs never loses state or scroll position.
- **Right: the live preview**, always visible on desktop, updating as the user types.
- **Click to edit.** Hovering a part of the preview outlines it with an *Edit* hint. Clicking it switches to *Content*, opens that section, scrolls to the field and focuses it. A job's bullet goes straight to that bullet. This works from any tab, so editing from the Design tab is one click.
- **The form points back.** Focusing a field highlights the matching element in the preview and scrolls the preview to it.
- **Phone.** One pane at a time with a bottom bar: *Content · Design · Preview*. Tapping an element in Preview opens Content at that field; a *Back to preview* chip returns to the same scroll position.

## Journeys

### A. Build with the form

Home → **Start with the form** → workspace on *Content* with the default template in the preview → user types; the preview grows → *Design* tab or *Browse all templates* to choose → **Download PDF**.

### B. Import valid JSON (the AI path)

Home or Import → drop / choose / paste the file → **Import summary** (Priya Raman · 3 jobs · 2 projects · 4 skill groups) → **Choose a template** (gallery with their own data) → workspace on *Design*, with a review banner:

> Imported from JSON. **Review content** · 3 notes from your AI · 1 field you may want to fill (phone)

- *Review content* opens the *Content* tab at the top.
- **Notes from your AI**: the AI prompt asks the model to list missing facts in `x-notes`. The banner shows them as a checklist; the app can't map a note to a field, so they're plain reminders the user ticks off.
- **Fields you may want to fill**: soft warnings, never blocking. Only a few: no email or phone, a job with no bullets, a summary over ~5 sentences.
- The banner can be dismissed and reopened from the problems icon in the top bar.

Users can skip the gallery (*Skip, use Meridian*) and pick a template later.

### C. Import JSON with errors

Import → error list with JSON paths, plain-language problems and fix hints → two ways forward:

- **Fix in the form** (primary). Everything that can be loaded is loaded; the workspace opens on *Content* with a **problems panel** listing each error. Clicking one jumps to the field. Bad values are kept in their field, not dropped (a date field shows the raw `Feb 2025` in red with *Couldn't read this date. Pick the month.*), so nothing the AI wrote is lost. Unknown keys can't be shown in the form; they're listed in the panel as *Not imported: basics.emial* so the user can retype them.
- **Copy errors for AI**. Copies the error list for pasting back into the chat; re-importing the corrected file replaces this one.

While errors remain, **Download PDF** says *Fix 2 problems to download* and opens the panel. Preview still renders what's valid.

### D. Come back later

Home shows **Continue editing** (name, template thumbnail, last edited). It reopens the workspace exactly where they left: tab, open section, scroll.

### E. Edit while previewing or exporting

There's no separate preview screen to get stuck on: the workspace is the preview. A full-screen **Focus preview** (the eye icon) hides the left panel for reading the pages and running the fit check; it keeps an *Edit* button in the corner, and click-to-edit still works and brings the panel back.

### F. Back to the AI and round again

People will alternate between the form and their AI. From the top bar:

- **Export JSON** downloads the current document, including the user's manual edits and any `x-` keys from the import (kept untouched).
- **Copy for AI** copies the AI prompt with the current JSON included and a line asking for improvements, so the next AI pass starts from the edited version, not the old one.

### G. Import when a draft already exists

Importing over a draft asks once: **Replace current resume** (with an *Undo* toast for 10 seconds, and *Export current JSON first* offered in the dialog) or **Cancel**. If multiple saved resumes are added later, a third option becomes *Open as a new resume*.

## Rules that keep it trustworthy

1. **One source of truth.** The form, the preview and the export all read and write one normalised document. Nothing the form can't show is thrown away on save: `x-` keys and unknown-but-valid data round-trip.
2. **Edits are never more than one click from anywhere** that shows resume content: workspace (both tabs), focus preview, review banner, problems panel.
3. **Never block reading, only exporting.** Invalid data shows in the preview as best it can; only the PDF waits for a valid document.
4. **Autosave everything**, on every change, with the status in the top bar. *Undo / Redo* (Ctrl/⌘+Z) cover form edits, reorders and replacing an import.

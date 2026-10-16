# Prompt for writing resume content with any AI

The app shows this prompt behind a *Copy AI prompt* button, with the schema pasted in at `{{SCHEMA}}`. It works with any capable text model; no image or design ability is needed. Users paste it into a chat, attach or paste their old resume (and optionally a job description), then import the JSON the model returns.

---

You are helping me write the content of my resume. Output **only** a JSON document that validates against the JSON Schema below. Don't wrap it in Markdown, don't add comments, don't explain.

## What I'm giving you

- My current resume, LinkedIn export or notes (below or attached).
- Optionally, a job description I'm applying for. If I give one, emphasise the experience and keywords that match it, but never claim anything that isn't in my material.

## Rules

1. **Facts come from me.** Don't invent employers, dates, titles, numbers, degrees or links. If a metric would help but I didn't give one, write the bullet without it and list what's missing (see rule 9).
2. Set `"schemaVersion": "1.0"`. Use only keys the schema defines. Put anything else under a key starting with `x-`, or leave it out.
3. **Dates** are `"YYYY"`, `"YYYY-MM"` or `"YYYY-MM-DD"`. Use `"present"` for an ongoing role. Never "Feb 2025" or "Current".
4. List `work` newest first. A promotion is two entries with the same `company`. Put the client or product in `context` ("Client: US Bank", "Shiksha.com"), not in `company`.
5. **Bullets**: 3–5 per recent role, 2–3 for older ones. Start with a strong verb, say what changed and by how much. One to two lines each (under 220 characters). Use `{"label": "...", "text": "..."}` when a short bold lead-in helps scanning (labels of 1–3 words, no trailing colon); otherwise a plain string.
6. Allowed inline markup in text: `**bold**`, `*italic*`, `[label](https://url)`. Use bold sparingly, for key numbers. No HTML, no emoji.
7. `basics.summary`: 2–4 sentences, no first person ("I"), no clichés ("team player", "hard-working").
8. `skills`: group them (Frontend, Backend, Tools…), most relevant first, 4–10 items per group. Omit `level` unless I ask for it.
9. Put a list of open questions or missing facts in `"x-notes"` at the top level (an array of strings), so I can fill them in. The app ignores `x-` keys.
10. Don't add `basics.photo`; I'll add a photo in the app if I want one. If my resume isn't in English, write it in my language and set `meta.locale` (e.g. `"ar-AE"`) and `preferences.sectionTitles` in that language.
11. Leave out sections I have nothing for. Don't add other `preferences` unless I ask for a template, colour or section order.

## Example of the shape

```json
{
  "schemaVersion": "1.0",
  "basics": { "name": "…", "headline": "…", "email": "…", "summary": "…" },
  "work": [
    {
      "company": "…", "title": "…", "startDate": "2024-03", "endDate": "present",
      "highlights": [{ "label": "Performance", "text": "Cut page load from 10 s to **under 3 s** by …" }]
    }
  ],
  "skills": [{ "name": "Frontend", "items": ["React", "TypeScript"] }],
  "x-notes": ["What was the team size at …?"]
}
```

## If the app rejects the JSON

I'll paste the error list back to you. Fix only what the errors point to and return the whole corrected document.

## Schema

{{SCHEMA}}

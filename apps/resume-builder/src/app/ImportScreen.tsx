// Import JSON: drop, choose or paste. A valid file shows what was found and a
// template choice; an invalid one lists problems with fix hints and still
// opens in the form; text that isn't JSON shows where parsing stopped.

import { useMemo, useRef, useState } from "react";
import type { Resume } from "../lib/types";
import { resolveTemplate } from "../templates/registry";
import { AI_PROMPT, copyText } from "./ai";
import { downloadExample, downloadResume, downloadSchema } from "./files";
import { prepareForForm, problemsForAI, stats, validate, normalizeForForm, type Validation } from "./validate";
import { TemplateCards } from "./workspace/Gallery";
import type { WorkspaceStart } from "./workspace/Workspace";

const MAX_BYTES = 5 * 1024 * 1024;

type State =
  | { k: "idle" }
  | { k: "notjson"; message: string; line?: number; col?: number }
  | { k: "valid"; doc: Resume }
  | { k: "invalid"; raw: unknown; v: Validation };

/** Line and column of a JSON.parse failure, from either message style browsers use. */
export function parseError(text: string, e: unknown): { message: string; line?: number; col?: number } {
  const msg = e instanceof Error ? e.message : String(e);
  const lc = msg.match(/line (\d+) column (\d+)/);
  if (lc) return { message: msg, line: +lc[1], col: +lc[2] };
  const pos = msg.match(/position (\d+)/);
  if (pos) {
    const before = text.slice(0, +pos[1]).split("\n");
    return { message: msg, line: before.length, col: before[before.length - 1].length + 1 };
  }
  return { message: msg };
}

export function readImport(text: string): State {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, "").trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1"));
  } catch (e) {
    return { k: "notjson", ...parseError(text, e) };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { k: "notjson", message: "This is JSON, but not a resume: the top level should be an object like { \"schemaVersion\": \"1.0\", \"basics\": { … } }." };
  const v = validate(raw);
  return v.valid ? { k: "valid", doc: normalizeForForm(raw as Resume) } : { k: "invalid", raw, v };
}

export function ImportScreen({ draft, onBack, onDone }: { draft: Resume | null; onBack: () => void; onDone: (s: WorkspaceStart) => void }) {
  const [state, setState] = useState<State>({ k: "idle" });
  const [paste, setPaste] = useState("");
  const [drag, setDrag] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const [pending, setPending] = useState<WorkspaceStart | null>(null);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (text: string) => {
    setNote("");
    const s = readImport(text);
    setState(s);
    if (s.k === "valid") setTemplate(resolveTemplate(s.doc.preferences?.template).id);
  };
  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setState({ k: "notjson", message: `This file is ${(f.size / 1048576).toFixed(1)} MB. A resume JSON is usually under 100 KB; check you picked the right file.` });
    load(await f.text());
  };

  const finish = (s: WorkspaceStart) => (draft ? setPending(s) : onDone(s));
  const preview = useMemo(() => (state.k === "valid" && template ? { ...state.doc, preferences: { ...state.doc.preferences, template } } : null), [state, template]);

  return (
    <div className="home">
      <header className="home-top">
        <button type="button" className="brand" onClick={onBack} title="Folio home"><span className="brand-mark">F</span><span className="brand-name">Folio</span></button>
      </header>
      <main className="home-main import">
        <div className="import-main">
          <button type="button" className="btn-link back" onClick={onBack}>← Back</button>
          <h1 className="home-h1">Import JSON</h1>
          <p className="home-lede">A file you downloaded from Folio before, or one your AI wrote with our prompt. It's read here and never uploaded.</p>

          {(state.k === "idle" || state.k === "notjson") && (
            <>
              <div
                className={"drop" + (drag ? " over" : "")}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files?.[0]); }}
              >
                <div className="drop-title">Drop your .json file here</div>
                <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>Choose file</button>
                <input ref={fileRef} type="file" accept="application/json,.json,text/plain" hidden onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div className="or">or paste it</div>
              <textarea className="f-input paste" aria-label="Paste JSON" placeholder='{ "schemaVersion": "1.0", "basics": { "name": "…" } }' value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} />
              <button type="button" className="btn" disabled={!paste.trim()} onClick={() => load(paste)}>Import pasted JSON</button>
              {state.k === "notjson" && (
                <div className="result result-bad" role="alert">
                  <div className="result-title">This isn't readable JSON{state.line ? ` (line ${state.line}, column ${state.col})` : ""}</div>
                  <div className="f-help">{state.message}</div>
                  <div className="f-help">AI chats sometimes add a sentence before or after the JSON. Copy only the part from the first {"{"} to the last {"}"}.</div>
                </div>
              )}
            </>
          )}

          {state.k === "valid" && preview && (
            <div className="result result-ok">
              <div className="result-title">Found {state.doc.basics.name || "a resume"}</div>
              <div className="f-help">{stats(state.doc).join(" · ") || "Basics only"}{state.doc.meta?.generator ? ` · ${state.doc.meta.generator}` : ""}</div>
              <h2 className="home-h2">Choose a template</h2>
              <TemplateCards doc={preview} current={template!} onPick={setTemplate} scale={0.24} />
              <div className="row-gap">
                <button type="button" className="btn btn-primary btn-lg" onClick={() => finish({ doc: preview, mode: "imported" })}>Continue with {resolveTemplate(template!).name}</button>
                <button type="button" className="btn btn-lg" onClick={() => setState({ k: "idle" })}>Import a different file</button>
              </div>
            </div>
          )}

          {state.k === "invalid" && (
            <div className="result result-bad">
              <div className="result-title">{state.v.errors.length + state.v.unknown.length} {state.v.errors.length + state.v.unknown.length === 1 ? "problem" : "problems"} in this file</div>
              <div className="f-help">You can fix them in the form: everything that fits is loaded, and bad values stay in their fields, marked in red. Or send the list back to your AI.</div>
              <ul className="problem-list">
                {state.v.errors.map((e) => (
                  <li key={e.dot}><code>{e.path}</code> {e.problem} <span className="f-help">{e.hint}</span></li>
                ))}
                {state.v.unknown.map((u) => (
                  <li key={u.dot}><code>{u.path}</code> isn't a field we know{u.suggestion ? `; did you mean “${u.suggestion}”?` : "."} <span className="f-help">It won't be imported; you can retype it in the form.</span></li>
                ))}
              </ul>
              <div className="row-gap align-center">
                <button type="button" className="btn btn-primary" onClick={() => { const { doc, dropped } = prepareForForm(state.raw); finish({ doc, dropped, mode: "errors" }); }}>Fix in the form</button>
                <button type="button" className="btn" onClick={async () => setNote((await copyText(problemsForAI(state.v, []))) ? "Copied. Paste it back to your AI, then import the corrected file." : "Your browser blocked the clipboard.")}>Copy errors for AI</button>
                <button type="button" className="btn-link" onClick={() => setState({ k: "idle" })}>Import a different file</button>
              </div>
              {note && <div className="f-help" role="status">{note}</div>}
            </div>
          )}
        </div>

        <aside className="import-side">
          <section className="ai-card">
            <h2 className="home-h2">Get JSON from any AI</h2>
            <p className="f-help">Copy this prompt into ChatGPT, Claude, Gemini or any chat, with your old resume. Import what it returns.</p>
            <button type="button" className="btn" onClick={async () => setNote((await copyText(AI_PROMPT)) ? "Copied the AI prompt." : "Your browser blocked the clipboard.")}>Copy the AI prompt</button>
            <details className="prompt-preview">
              <summary>Preview the prompt</summary>
              <pre>{AI_PROMPT.slice(0, 1800)}…</pre>
            </details>
          </section>
          <section className="ai-card">
            <h2 className="home-h2">For hand-written JSON</h2>
            <div className="row-gap">
              <button type="button" className="btn btn-sm" onClick={downloadSchema}>Download schema</button>
              <button type="button" className="btn btn-sm" onClick={downloadExample}>Download example JSON</button>
            </div>
          </section>
          {note && state.k !== "invalid" && <div className="f-help" role="status">{note}</div>}
        </aside>
      </main>

      {pending && draft && (
        <div className="scrim">
          <div role="alertdialog" aria-modal="true" aria-labelledby="rp-title" className="dialog">
            <div id="rp-title" className="dialog-title">Replace your current resume?</div>
            <p>This browser has a resume in progress ({draft.basics?.name || "untitled"}). Importing replaces it. You can undo right after.</p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => downloadResume(draft)}>Download current JSON first</button>
              <button type="button" className="btn" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => onDone({ ...pending, replaced: draft })}>Replace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

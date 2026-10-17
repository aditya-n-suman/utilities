import { useMemo, useState } from "react";
import full from "../../schema/examples/full.json";
import type { Resume } from "../lib/types";
import { buildView } from "../lib/view";
import { READY_TEMPLATES, templateTags } from "../templates/registry";
import { PAGE, ResumePage } from "../templates/ResumePage";
import { AI_PROMPT, copyText } from "./ai";
import { downloadResume } from "./files";
import { ago, type Draft } from "./storage";

const SAMPLE = full as unknown as Resume;

export function Home({ draft, onContinue, onStartFresh, onNew, onImport }: { draft: Draft | null; onContinue: () => void; onStartFresh: () => void; onNew: () => void; onImport: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const thumbs = useMemo(() => READY_TEMPLATES.map((t) => ({ t, vm: buildView(SAMPLE, { template: t.id, accent: t.accent }) })), []);
  const dn = draft?.doc.basics?.name || "Untitled resume";
  const dt = READY_TEMPLATES.find((t) => t.id === draft?.doc.preferences?.template)?.name ?? READY_TEMPLATES[0].name;

  return (
    <div className="home">
      <header className="home-top">
        <span className="brand static"><span className="brand-mark">F</span><span className="brand-name">Folio</span></span>
      </header>
      <main className="home-main">
        {draft ? (
          <section className="welcome" aria-labelledby="wb-title">
            <h1 id="wb-title" className="home-h1">Welcome back</h1>
            <p className="home-lede">You have a resume in progress: <strong>{dn}</strong> · {dt} · edited {ago(draft.savedAt)}.</p>
            {!confirm ? (
              <div className="row-gap">
                <button type="button" className="btn btn-primary btn-lg" onClick={onContinue}>Continue where you left off</button>
                <button type="button" className="btn btn-lg" onClick={() => setConfirm(true)}>Start fresh</button>
              </div>
            ) : (
              <div className="confirm">
                <p><strong>Start fresh?</strong> This deletes the copy saved in this browser. If you might want it again, download the JSON first.</p>
                <div className="row-gap">
                  <button type="button" className="btn" onClick={() => downloadResume(draft.doc)}>Download JSON first</button>
                  <button type="button" className="btn" onClick={() => setConfirm(false)}>Cancel</button>
                  <button type="button" className="btn btn-danger" onClick={onStartFresh}>Delete and start fresh</button>
                </div>
              </div>
            )}
            <p className="f-help">Only this browser has this copy. Download the JSON to keep it anywhere else.</p>
          </section>
        ) : (
          <>
            <section className="hero">
              <h1 className="home-h1">A resume that looks right, made in your browser.</h1>
              <p className="home-lede">Fill in a form, or bring JSON written with any AI. Pick a template and download a PDF. Nothing leaves your device.</p>
            </section>
            <section className="choices" aria-label="How to start">
              <button type="button" className="choice" onClick={onNew}>
                <span className="choice-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg></span>
                <span className="choice-title">Start with the form</span>
                <span className="choice-text">Type your details; the resume builds as you go.</span>
              </button>
              <button type="button" className="choice" onClick={onImport}>
                <span className="choice-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20V9 M7 14l5-5 5 5 M5 4h14" /></svg></span>
                <span className="choice-title">Import JSON</span>
                <span className="choice-text">Open a file you saved before, or one your AI wrote.</span>
              </button>
            </section>
            <section className="ai-card" aria-labelledby="ai-title">
              <h2 id="ai-title" className="home-h2">Resume with AI</h2>
              <ol className="steps">
                <li><strong>Copy our prompt.</strong> It tells the AI exactly what JSON to write.</li>
                <li><strong>Paste it into any AI chat</strong> with your old resume or notes. A text model is enough.</li>
                <li><strong>Import the JSON</strong> it gives back. Folio does the design.</li>
              </ol>
              <div className="row-gap align-center">
                <button type="button" className="btn" onClick={async () => setCopied((await copyText(AI_PROMPT)) ? "ok" : "fail")}>Copy the AI prompt</button>
                {copied === "ok" && <span className="f-help" role="status">Copied. Paste it into your AI chat.</span>}
                {copied === "fail" && <span className="f-error" role="status">Your browser blocked the clipboard.</span>}
              </div>
            </section>
          </>
        )}
        <section className="strip" aria-labelledby="strip-title">
          <h2 id="strip-title" className="home-h2">Templates</h2>
          <div className="strip-row">
            {thumbs.map(({ t, vm }) => (
              <figure key={t.id} className="strip-card">
                <div className="strip-page" style={{ inlineSize: PAGE.A4.width * 0.26, blockSize: PAGE.A4.height * 0.26 }} aria-hidden="true">
                  <div className="tcard-inner" style={{ inlineSize: PAGE.A4.width, transform: "scale(0.26)" }}><ResumePage vm={vm} /></div>
                </div>
                <figcaption><strong>{t.name}</strong><span className="f-help">{templateTags(t).join(" · ")}</span></figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>
      <footer className="home-foot f-help">Folio runs entirely in your browser. Your resume is never uploaded. <a href="#/templates">Template sheet</a></footer>
    </div>
  );
}

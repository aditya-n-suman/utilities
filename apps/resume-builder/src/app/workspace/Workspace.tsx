// The workspace (UX.md): form, design controls and live preview are views of
// one document. Any part of the preview is one click from its field. Imports
// land on the rendered resume with a review banner; imports with errors open
// on the form with the problems panel. Ported from design/FolioWorkspaceApp.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { findFit, type PageCount } from "../../lib/paginate";
import { setAt } from "../../lib/paths";
import { documentTitle, printResume } from "../../lib/print";
import type { Resume } from "../../lib/types";
import { buildView } from "../../lib/view";
import { copyText, promptWithResume } from "../ai";
import { downloadResume } from "../files";
import { removeDraft, saveDraft, type DraftUi } from "../storage";
import { problemsForAI, softWarnings, stats, validate, type Unknown } from "../validate";
import { ContentTab } from "./ContentTab";
import { WsContext, type Ws } from "./context";
import { CropDialog } from "./CropDialog";
import { DesignTab } from "./DesignTab";
import { Gallery } from "./Gallery";
import { itemOf, sectionOf, toForm } from "./pathmap";
import { Preview } from "./Preview";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export type StartMode = "new" | "imported" | "errors" | "draft";

export interface WorkspaceStart {
  doc: Resume;
  mode: StartMode;
  dropped?: Unknown[];
  ui?: DraftUi;
  /** The draft this import replaced, for Undo. */
  replaced?: Resume;
}

export const blankResume = (): Resume => ({ schemaVersion: "1.0", basics: { name: "" } });

type Pane = "content" | "design" | "preview";
type Save = "saved" | "failed" | "off";

export function Workspace({ start, onHome }: { start: WorkspaceStart; onHome: () => void }) {
  const [doc, setDoc] = useState<Resume>(start.doc);
  const [dropped, setDropped] = useState<Unknown[]>(start.dropped ?? []);
  const [tab, setTab] = useState<"content" | "design">(start.mode === "imported" ? "design" : start.ui?.tab ?? "content");
  const [open, setOpen] = useState<string | null>(start.mode === "imported" ? null : start.ui?.open ?? (start.mode === "new" ? "basics" : null));
  const [openItem, setOpenItem] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [problemsOpen, setProblemsOpen] = useState(start.mode === "errors");
  const [banner, setBanner] = useState(start.mode === "imported");
  const [notesDone, setNotesDone] = useState<Record<number, boolean>>({});
  const [focusMode, setFocusMode] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"start" | null>(null);
  const [gallery, setGallery] = useState(false);
  const [crop, setCrop] = useState<string | null>(null);
  const [toastState, setToastState] = useState<{ msg: string; undo?: Resume } | null>(null);
  const [save, setSave] = useState<Save>("saved");
  const [tip, setTip] = useState(false);
  const [pane, setPane] = useState<Pane>(start.mode === "imported" ? "preview" : "content");
  const [pages, setPages] = useState<PageCount>({ pages: 1, lastFill: 0, breaks: [] });
  const [pendingFocus, setPendingFocus] = useState<string | null>(start.mode === "new" ? "basics.name" : null);
  const storageOff = useRef(false);
  // "Required" errors stay quiet on fields nobody has visited yet, until the
  // person asks to see problems; a blank form shouldn't open in red.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [reveal, setReveal] = useState(start.mode !== "new");
  const formRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();

  const vm = useMemo(() => buildView(doc), [doc]);
  const validation = useMemo(() => validate(doc), [doc]);
  const shown = useMemo(() => validation.errors.filter((e) => reveal || e.kind !== "required" || touched.has(e.dot)), [validation, reveal, touched]);
  const errors = useMemo(() => new Map(shown.map((e) => [e.dot, e])), [shown]);
  const nErr = validation.errors.length + validation.unknown.length;
  const size = doc.preferences?.pageSize ?? "A4";
  const title = documentTitle(doc);

  const toast = useCallback((msg: string, undo?: Resume) => {
    window.clearTimeout(toastTimer.current);
    setToastState({ msg, undo });
    toastTimer.current = window.setTimeout(() => setToastState(null), undo ? 10000 : 5000);
  }, []);

  const ws: Ws = useMemo(
    () => ({
      doc,
      set: (path, value) => setDoc((d) => setAt(d, path, value)),
      update: (fn) => setDoc((d) => fn(d)),
      errors,
      active,
      focusField: (p) => setPendingFocus(p),
      toast,
    }),
    [doc, errors, active, toast],
  );

  useEffect(() => {
    if (start.replaced) toast("Replaced the resume that was in this browser.", start.replaced);
    if (start.mode === "errors") {
      const first = validate(start.doc).errors[0];
      if (first) {
        setOpen(sectionOf(first.dot, start.doc));
        setOpenItem(Math.max(0, itemOf(first.dot)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave the one working copy: shortly after the first unsaved change
  // (not reset by further typing), and at once when the page is hidden or the
  // workspace closes, so nothing typed just before leaving is lost.
  const latest = useRef({ doc, ui: { tab, open } as DraftUi });
  latest.current = { doc, ui: { tab, open } };
  const saveTimer = useRef<number>();
  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    if (storageOff.current) return setSave("off");
    setSave(saveDraft(latest.current.doc, latest.current.ui) ? "saved" : "failed");
  }, []);
  useEffect(() => {
    if (storageOff.current) return setSave("off");
    if (saveTimer.current === undefined) saveTimer.current = window.setTimeout(flush, 400);
  }, [doc, tab, open, flush]);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      if (saveTimer.current !== undefined) flush();
    };
  }, [flush]);

  // Focus a form field once it has rendered (after click-to-edit, add, etc.).
  useLayoutEffect(() => {
    if (!pendingFocus) return;
    const root = formRef.current;
    if (!root) return;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel);
    const esc = (s: string) => s.replace(/"/g, '\\"');
    let el = q(`[data-field="${esc(pendingFocus)}"]`) ?? q(`[data-field^="${esc(pendingFocus)}."]`);
    if (!el) {
      const i = pendingFocus.lastIndexOf(".");
      if (i > 0) el = q(`[data-field^="${esc(pendingFocus.slice(0, i))}"]`);
    }
    if (!el) return;
    el.focus({ preventScroll: true });
    const pr = root.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    root.scrollTop += er.top - pr.top - 120;
    setActive(el.dataset.field ?? pendingFocus);
    setPendingFocus(null);
  });

  const pick = (path: string) => {
    setFocusMode(false);
    setTab("content");
    setPane("content");
    setOpen(sectionOf(path, doc));
    const i = itemOf(path);
    if (i >= 0) setOpenItem(i);
    setMenu(false);
    setPendingFocus(toForm(path, doc));
  };

  const downloadJSON = () => toast(`Downloaded ${downloadResume(doc)}`);
  const downloadPDF = () => {
    printResume(doc, {}, size).catch(() => toast("The PDF couldn't be prepared. Try again, or use your browser's Print menu."));
  };
  const copyAI = async () => {
    const ok = await copyText(promptWithResume(doc));
    toast(ok ? "Copied the AI prompt with your current resume. Paste it into any AI chat." : "Your browser blocked the clipboard. Download the JSON instead.");
  };
  const copyErrors = async () => {
    const ok = await copyText(problemsForAI(validation, dropped));
    toast(ok ? `Copied ${validation.errors.length + validation.unknown.length + dropped.length} problems. Paste them back to your AI.` : "Your browser blocked the clipboard.");
  };
  const fit = (target: number) => {
    const sheet = sheetRef.current?.querySelector<HTMLElement>(".folio-page");
    if (!sheet) return;
    const r = findFit(sheet, size, target, { textScale: vm.textScale, spacingScale: vm.spacingScale });
    if (!r) return toast(`Even at text 85% and spacing 50% this needs more than ${target} ${target === 1 ? "page" : "pages"}. Hide a section or trim some bullets.`);
    const prev = doc;
    setDoc((d) => setAt(setAt(d, "preferences.textScale", r.textScale === 1 ? undefined : r.textScale), "preferences.spacingScale", r.spacingScale === 1 ? undefined : r.spacingScale));
    toast(`Fits on ${target} ${target === 1 ? "page" : "pages"}: text ${Math.round(r.textScale * 100)}%, spacing ${Math.round(r.spacingScale * 100)}%.`, prev);
  };
  const startOver = () => {
    const prev = doc;
    removeDraft();
    setDoc(blankResume());
    setDropped([]);
    setDialog(null);
    setBanner(false);
    setProblemsOpen(false);
    setTab("content");
    setPane("content");
    setOpen("basics");
    setPendingFocus("basics.name");
    toast("Started over. The saved copy was removed from this browser.", prev);
  };
  const removeFromBrowser = () => {
    removeDraft();
    storageOff.current = true;
    setSave("off");
    setMenu(false);
    toast("Removed from this browser. You can keep editing; download the JSON before you close the tab.");
  };
  const onPhotoFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast("Use a PNG, JPEG or WebP image.");
    const r = new FileReader();
    r.onload = () => setCrop(String(r.result));
    r.readAsDataURL(f);
  };
  const onPages = useCallback((p: PageCount) => setPages(p), []);

  const notes = Array.isArray(doc["x-notes"]) ? (doc["x-notes"] as unknown[]).filter((n): n is string => typeof n === "string") : [];
  const warns = softWarnings(doc);
  const badge = nErr || dropped.length || (start.mode === "imported" ? notes.filter((_, i) => !notesDone[i]).length + warns.length : 0);

  const problems = problemsOpen && (nErr > 0 || dropped.length > 0) && (
    <section className="problems" aria-label="Problems">
      <div className="problems-head">
        <div>
          <div className="problems-title">{nErr ? `Fix ${nErr} ${nErr === 1 ? "problem" : "problems"} to download the PDF` : "All problems fixed"}</div>
          <div className="f-help">{nErr ? "We loaded everything we could. Bad values stay in their fields, marked in red." : "You can download the PDF now."}</div>
        </div>
        <button type="button" className="icon-btn" aria-label="Close problems" onClick={() => setProblemsOpen(false)}>✕</button>
      </div>
      {validation.errors.map((e) => (
        <div key={e.dot} className="problem">
          <button type="button" className="problem-main" onClick={() => pick(e.dot)}>
            <code>{e.path}</code>
            <span className="problem-text">{e.problem}</span>
            <span className="f-help">{e.hint}</span>
          </button>
          <span className="problem-actions">
            {e.fix && e.kind !== "version" && <button type="button" className="btn btn-sm" onClick={() => ws.set(e.dot, e.fix)}>Use suggestion</button>}
            <button type="button" className="btn-link" onClick={() => pick(e.dot)}>Go to field →</button>
          </span>
        </div>
      ))}
      {dropped.length > 0 && (
        <div className="not-imported">
          <div className="d-title">Not imported</div>
          {dropped.map((u) => (
            <div key={u.dot} className="ni-row">
              <span>
                <code>{u.path}</code> {u.reason === "type" ? "had the wrong shape." : u.suggestion ? `is an unknown key, probably “${u.suggestion}”. Retype it there.` : "is an unknown key. Retype it where it belongs."}
                <span className="f-help"> Value: <span dir="ltr" className="mono-sm">{typeof u.value === "string" ? u.value : JSON.stringify(u.value)}</span></span>
              </span>
              {u.target && <button type="button" className="btn-link" onClick={() => pick(u.target!)}>Go to {u.suggestion} →</button>}
            </div>
          ))}
          <button type="button" className="btn-link" onClick={() => setDropped([])}>Dismiss this list</button>
        </div>
      )}
      <button type="button" className="btn btn-sm" onClick={copyErrors}>Copy errors for AI</button>
    </section>
  );

  return (
    <WsContext.Provider value={ws}>
      <div className={cx("ws", `pane-${pane}`, focusMode && "focus")}>
        <header className="topbar">
          <button type="button" className="brand" onClick={onHome} title="Folio home">
            <span className="brand-mark">F</span>
            <span className="brand-name">Folio</span>
          </button>
          <input className="doc-name" aria-label="Document name" value={doc.meta?.title ?? ""} placeholder={title} onChange={(e) => ws.set("meta.title", e.target.value)} />
          <div className="status" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} onFocus={() => setTip(true)} onBlur={() => setTip(false)} tabIndex={0}>
            {save === "saved" ? (
              <span className="status-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F7A45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Saved in this browser</span>
            ) : (
              <span className="status-warn">Not saved in this browser. Download JSON to keep your work.</span>
            )}
            {tip && <div role="tooltip" className="tooltip">{save === "saved" ? "Only on this device. Download JSON to keep a copy." : save === "off" ? "You removed the copy from this browser. Your work is only in this tab until you download the JSON." : "This browser refused to save (storage full, blocked or private mode). Your work is only in this tab until you download the JSON."}</div>}
          </div>
          <span className="grow" />
          <button type="button" className="icon-btn boxed" aria-label={nErr ? `${nErr} problems` : "Review notes and warnings"} title={nErr ? `${nErr} problems` : "Review notes and warnings"} onClick={() => { setReveal(true); if (nErr || dropped.length) setProblemsOpen(!problemsOpen); else setBanner(!banner); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7.5v5.5 M12 16.5v.5" /></svg>
            {badge > 0 && <span className={cx("badge", nErr > 0 && "err")}>{badge}</span>}
          </button>
          <button type="button" className={cx("icon-btn boxed", focusMode && "on")} aria-label="Focus preview" aria-pressed={focusMode} title="Focus preview" onClick={() => setFocusMode(!focusMode)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z" /></svg>
          </button>
          <span className="sep wide-only" />
          <button type="button" className="btn wide-only" onClick={copyAI}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 9h11v11H9z M5 15H4V4h11v1" /></svg>Copy for AI
          </button>
          <button type="button" className="btn wide-only" onClick={downloadJSON}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 4v11 M7 10l5 5 5-5 M5 20h14" /></svg>Download JSON
          </button>
          {nErr ? (
            <button type="button" className="btn btn-blocked" onClick={() => { setReveal(true); setProblemsOpen(true); setFocusMode(false); setPane("content"); }}>
              <span className="wide-only">Fix {nErr} {nErr === 1 ? "problem" : "problems"} to download</span>
              <span className="narrow-only">Fix {nErr}</span>
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={downloadPDF}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 4v11 M7 10l5 5 5-5 M5 20h14" /></svg>
              <span className="wide-only">Download PDF</span>
              <span className="narrow-only">PDF</span>
            </button>
          )}
          <div className="menu-wrap">
            <button type="button" className="icon-btn boxed" aria-label="Document menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
            {menu && (
              <div role="menu" className="menu doc-menu" onClick={() => setMenu(false)}>
                <button type="button" role="menuitem" className="menu-item narrow-only" onClick={copyAI}>Copy for AI<span className="menu-sub">Prompt plus your current resume</span></button>
                <button type="button" role="menuitem" className="menu-item narrow-only" onClick={downloadJSON}>Download JSON<span className="menu-sub">Your real save. Re-import it any time.</span></button>
                <button type="button" role="menuitem" className="menu-item" onClick={() => setDialog("start")}>Start over<span className="menu-sub">Clear the form and begin again</span></button>
                <button type="button" role="menuitem" className="menu-item danger" onClick={removeFromBrowser}>Remove from this browser<span className="menu-sub">For shared computers. Keeps working from memory.</span></button>
              </div>
            )}
          </div>
        </header>

        <div className="ws-body">
          <aside className="panel">
            <div role="tablist" className="tabs">
              {(["content", "design"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={cx("tab", tab === t && "on")} onClick={() => { setTab(t); setPane(t); }}>
                  {t === "content" ? "Content" : "Design"}
                </button>
              ))}
            </div>
            <div
              ref={formRef}
              className="panel-scroll"
              onFocus={(e) => {
                const f = (e.target as HTMLElement).dataset?.field;
                if (f && f !== active) setActive(f);
              }}
              onBlur={(e) => {
                const f = (e.target as HTMLElement).dataset?.field;
                if (f && !touched.has(f)) setTouched(new Set(touched).add(f));
              }}
            >
              {problems}
              {tab === "content" ? (
                <ContentTab open={open} setOpen={setOpen} openItem={openItem} setOpenItem={setOpenItem} template={vm.template} onPickPhoto={() => fileRef.current?.click()} onCrop={() => doc.basics.photo?.src && setCrop(doc.basics.photo.src)} />
              ) : (
                <DesignTab vm={vm} pages={pages} onBrowse={() => setGallery(true)} onFit={fit} onFocusPreview={() => { setFocusMode(true); setPane("preview"); }} />
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { onPhotoFile(e.target.files?.[0]); e.target.value = ""; }} />
          </aside>

          <main className="pv-pane">
            {focusMode && (
              <div className="focus-bar">
                <div className="focus-title">{title}</div>
                <div className="f-help">{pages.pages === 1 ? "One page" : `${pages.pages} pages`} · {size} · {vm.template.name}</div>
                <span className="grow" />
                <span className="f-help wide-only">The PDF keeps real, selectable text, so applicant tracking systems can read it.</span>
                <button type="button" className="btn btn-dark" onClick={() => setFocusMode(false)}>Edit</button>
              </div>
            )}
            <div className="pv-inner">
              {banner && !focusMode && (
                <section className="banner" aria-label="Import review">
                  <div className="banner-head">
                    <div className="banner-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
                    <div className="grow">
                      <div className="banner-title">Imported from JSON{doc.meta?.generator && <span className="banner-gen"> · {doc.meta.generator}</span>}</div>
                      <div className="f-help">We found {stats(doc).join(", ") || "your details"}. Check what your AI wrote, then download.</div>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => { setTab("content"); setPane("content"); setOpen("basics"); formRef.current?.scrollTo({ top: 0 }); }}>Review content</button>
                    <button type="button" className="icon-btn" aria-label="Dismiss" title="Dismiss. Reopen from the problems icon." onClick={() => setBanner(false)}>✕</button>
                  </div>
                  <div className="banner-cols">
                    <div>
                      <div className="d-title">{notes.length ? `${notes.length} ${notes.length === 1 ? "note" : "notes"} from your AI` : "No notes from your AI"}</div>
                      {notes.map((n, i) => (
                        <label key={i} className={cx("note", notesDone[i] && "done")}>
                          <input type="checkbox" checked={!!notesDone[i]} onChange={() => setNotesDone({ ...notesDone, [i]: !notesDone[i] })} />
                          <span>{n}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <div className="d-title">{warns.length ? `${warns.length} ${warns.length === 1 ? "thing" : "things"} you may want to add` : "Nothing else stands out"}</div>
                      {warns.map((w) => (
                        <div key={w.path} className="warn-row">
                          <span className="dot-warn" />
                          <span className="grow">{w.text}</span>
                          <button type="button" className="btn-link" onClick={() => pick(w.path)}>{w.action}</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
              {!focusMode && (
                <div className="pv-meta">
                  <span>{vm.template.name} · {pages.pages === 1 ? "one page" : `${pages.pages} pages`} · {size}</span>
                  <span className="wide-only">Hover any part to edit it</span>
                </div>
              )}
              <Preview doc={doc} vm={vm} size={size} active={focusMode ? null : active} errors={focusMode ? [] : shown} maxScale={focusMode ? 1 : 0.92} sheetRef={sheetRef} onPick={pick} onPages={onPages} big={focusMode} />
            </div>
          </main>
        </div>

        <nav className="bottombar" aria-label="Workspace panes">
          {(["content", "design", "preview"] as const).map((p) => (
            <button key={p} type="button" className={cx("bb-btn", pane === p && "on")} aria-pressed={pane === p} onClick={() => { setPane(p); if (p !== "preview") setTab(p); }}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </nav>

        {gallery && <Gallery doc={doc} current={vm.template.id} onPick={(id) => ws.set("preferences.template", id)} onClose={() => setGallery(false)} />}
        {crop && (
          <CropDialog
            src={crop}
            onCancel={() => setCrop(null)}
            onSave={(src) => {
              setDoc((d) => setAt(setAt(d, "basics.photo", { src, alt: d.basics?.name || "Photo" }), "preferences.avatar", undefined));
              setCrop(null);
            }}
          />
        )}
        {dialog === "start" && (
          <div className="scrim">
            <div role="alertdialog" aria-modal="true" aria-labelledby="so-title" className="dialog">
              <div id="so-title" className="dialog-title">Start over?</div>
              <p>This clears every field and removes the copy saved in this browser. If you might want this version again, download the JSON first.</p>
              <div className="dialog-actions">
                <button type="button" className="btn" onClick={downloadJSON}>Download JSON first</button>
                <button type="button" className="btn" onClick={() => setDialog(null)}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={startOver}>Start over</button>
              </div>
            </div>
          </div>
        )}
        {toastState && (
          <div role="status" className="toast">
            <span>{toastState.msg}</span>
            {toastState.undo && (
              <button type="button" className="toast-btn" onClick={() => { setDoc(toastState.undo!); setToastState(null); }}>Undo</button>
            )}
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => setToastState(null)}>✕</button>
          </div>
        )}
      </div>
    </WsContext.Provider>
  );
}

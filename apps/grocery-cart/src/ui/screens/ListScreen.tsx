// A2 Paste list, plus the delivery choice (Quick / Shop all) added after the design.

import { useMemo, useRef, useState } from "react";
import type { Mode } from "../../engine/jiomart/api.ts";
import { formatQuantity, type ListError, type ListItem, parseList } from "../../engine/list.ts";
import { act, type AppState } from "../api.ts";
import { plural } from "../format.ts";

type PreviewRow = { line: number; item?: ListItem; error?: ListError };

const MODES: { mode: Mode; title: string; sub: string }[] = [
  { mode: "quick", title: "Quick", sub: "Nearby store, delivered fast" },
  { mode: "all", title: "Shop all", sub: "Full range, scheduled; most kitchenware" },
];

export function ListScreen({ state }: { state: AppState }) {
  const [text, setText] = useState(state.lastList);
  const [mode, setMode] = useState<Mode>(state.connection.modes[state.lastMode] ? state.lastMode : state.connection.modes.quick ? "quick" : "all");
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const gutter = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(() => parseList(text), [text]);
  const rows = useMemo(
    () =>
      [
        ...parsed.items.map((i): PreviewRow => ({ line: i.line, item: i })),
        ...parsed.errors.map((e): PreviewRow => ({ line: e.line, error: e })),
      ].sort((a, b) => a.line - b.line),
    [parsed],
  );
  const lineCount = Math.max(text.split("\n").length, 20);

  const find = async () => {
    setBusy(true);
    await act("find", { text, mode });
    setBusy(false);
  };

  return (
    <>
      <main className="page">
        <div className="page-head">
          <h1>Your list</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div className="seg" role="radiogroup" aria-label="Delivery">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  role="radio"
                  aria-checked={mode === m.mode}
                  disabled={!state.connection.modes[m.mode]}
                  title={state.connection.modes[m.mode] ? undefined : `Search once in ${m.title} on JioMart first`}
                  onClick={() => setMode(m.mode)}
                >
                  <span className="seg-t">{m.title}</span>
                  <span className="seg-s">{m.sub}</span>
                </button>
              ))}
            </div>
            {state.lastList && state.lastList !== text && (
              <button className="linkish" onClick={() => setText(state.lastList)}>
                Load last list
              </button>
            )}
          </div>
        </div>
        <div className="list-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
            <div className="hint-row">
              <span>
                <code>what to buy ; how much ; note</code>  e.g. <code>Atta ; 5 kg ; आटा</code>
              </span>
              <button className="btn-help" aria-expanded={helpOpen} aria-controls="fmt-help" onClick={() => setHelpOpen(!helpOpen)}>
                Format help
              </button>
            </div>
            {helpOpen && (
              <div id="fmt-help" className="popover" role="dialog" aria-label="Format help">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 14.5 }}>Format help</strong>
                  <button className="x" aria-label="Close format help" onClick={() => setHelpOpen(false)}>
                    ×
                  </button>
                </div>
                <ol>
                  <li>
                    One item per line: <code>what to buy ; how much ; note</code>
                  </li>
                  <li>
                    How much is a count like <code>x6</code>, or an amount in <code>g</code>, <code>kg</code>, <code>ml</code> or <code>L</code> like{" "}
                    <code>5 kg</code>. Left out means <code>x1</code>.
                  </li>
                  <li>A size in the name describes each piece: <code>Container 1 kg ; x6</code> is six 1 kg containers.</li>
                  <li>The note is optional and can be in Hindi or English. It's shown while reviewing, never searched.</li>
                  <li>
                    Lines starting with <code>#</code> are ignored.
                  </li>
                </ol>
              </div>
            )}
            <div className="editor">
              <div className="gutter" ref={gutter} aria-hidden="true">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={area}
                aria-label="Grocery list"
                spellCheck={false}
                value={text}
                placeholder={"Atta ; 5 kg ; आटा\nToor dal ; 2 kg\nPressure cooker 5 L ; x1"}
                onChange={(e) => setText(e.target.value)}
                onScroll={(e) => {
                  if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="hint-row">How each line was read</div>
            <ol className="preview" aria-label="Parsed list preview">
              {rows.length === 0 && (
                <li style={{ display: "block", border: "none" }}>
                  <div className="empty-note">
                    <strong style={{ fontSize: 17 }}>Your list is empty</strong>
                    <span className="muted">
                      Type or paste one item per line, like <code className="mono">Atta ; 5 kg ; आटा</code>
                    </span>
                    <div style={{ display: "flex", gap: 10 }}>
                      {state.lastList && (
                        <button className="btn-m" onClick={() => setText(state.lastList)}>
                          Load last list
                        </button>
                      )}
                      <button className="btn-m" onClick={() => setHelpOpen(true)}>
                        Format help
                      </button>
                    </div>
                  </div>
                </li>
              )}
              {rows.map((r) => (
                <li key={r.line}>
                  <span className="ln">{r.line}</span>
                  {r.item ? (
                    <div className="read">
                      <span style={{ fontWeight: 500 }}>{r.item.query}</span>
                      <span className="qty">{formatQuantity(r.item.qty)}</span>
                      {r.item.note && (
                        <span lang="hi" className="muted" style={{ fontSize: 13.5 }}>
                          {r.item.note}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="err" role="alert">
                      <span style={{ fontWeight: 600 }}>
                        Line {r.line}: {r.error!.error}
                      </span>
                      <code>{r.error!.raw}</code>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
      <footer className="foot">
        <div style={{ display: "flex", gap: 16, alignItems: "baseline", fontSize: 14 }}>
          <span>
            <span className="mono" style={{ fontWeight: 600 }}>
              {parsed.items.length}
            </span>{" "}
            {parsed.items.length === 1 ? "item" : "items"}
          </span>
          {parsed.errors.length > 0 && <span className="bad">{plural(parsed.errors.length, "line")} can't be read</span>}
        </div>
        <button className="btn" disabled={!parsed.items.length || busy || !state.connection.modes[mode]} onClick={() => void find()}>
          Find products
        </button>
      </footer>
    </>
  );
}

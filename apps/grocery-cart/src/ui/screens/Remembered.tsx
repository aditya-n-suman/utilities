// A7 Remembered choices: searchable, Change (search JioMart and pick another product), Forget.

import { Fragment, useState } from "react";
import type { Mode } from "../../engine/jiomart/api.ts";
import type { Candidate } from "../../engine/match.ts";
import type { Remembered as Rem } from "../../engine/remembered.ts";
import { act } from "../api.ts";
import { MODE_LABEL, perUnit, Thumb } from "../bits.tsx";
import { day, rupees } from "../format.ts";

function ChangePanel({ item, modes, onDone }: { item: Rem; modes: Record<Mode, boolean>; onDone: () => void }) {
  const [words, setWords] = useState(item.key);
  const [mode, setMode] = useState<Mode>(item.mode && modes[item.mode] ? item.mode : modes.quick ? "quick" : "all");
  const [results, setResults] = useState<Candidate[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setError(undefined);
    const r = (await act("remembered/search", { words, mode })) as { candidates?: Candidate[]; error?: string };
    setResults(r.candidates ?? []);
    setError(r.error);
    setBusy(false);
  };
  const pick = async (uid: number) => {
    await act("remembered/set", { key: item.key, uid });
    onDone();
  };

  return (
    <div style={{ padding: "4px 20px 18px", display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid var(--line)" }}>
      <form
        role="search"
        className="hand-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (words.trim()) void search();
        }}
      >
        <input type="search" value={words} onChange={(e) => setWords(e.target.value)} aria-label={`Search JioMart for ${item.key}`} autoFocus />
        <div className="seg" role="radiogroup" aria-label="Delivery" style={{ padding: 2 }}>
          {(["quick", "all"] as Mode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={!modes[m]} onClick={() => setMode(m)} style={{ padding: "4px 10px" }}>
              <span className="seg-t" style={{ fontSize: 13 }}>
                {MODE_LABEL[m]}
              </span>
            </button>
          ))}
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "Searching…" : "Search"}
        </button>
        <button type="button" className="btn-s" style={{ height: 36 }} onClick={onDone}>
          Cancel
        </button>
      </form>
      {error && (
        <span className="bad" role="alert" style={{ fontSize: 13.5 }}>
          {error}
        </span>
      )}
      {results && !error && results.length === 0 && <span className="muted">Nothing on JioMart {MODE_LABEL[mode]} matched “{words}”.</span>}
      {results && results.length > 0 && (
        <div className="listbox" role="listbox" aria-label={`Products for ${item.key}`}>
          <div className="lb-head">Best match first · pick one to remember</div>
          {results.map((o) => (
            <div
              key={o.product.uid}
              className="option"
              role="option"
              aria-selected={o.product.uid === item.uid}
              tabIndex={0}
              onClick={() => void pick(o.product.uid)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void pick(o.product.uid);
                }
                if (e.key === "Escape") onDone();
              }}
            >
              <Thumb src={o.product.image} size={36} />
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span className="o-name">{o.product.name}</span>
                <span className="o-sub">
                  {o.product.pack ? `${o.product.pack.value} ${o.product.pack.unit}` : (o.product.packText ?? "Pack not stated")} · {perUnit(o)}
                  {o.product.sellable ? "" : " · out of stock"}
                </span>
              </div>
              <div className="o-right">
                <span className="o-price">{rupees(o.product.price)}</span>
                <span className="o-tag">{o.product.uid === item.uid ? "Current" : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Remembered({ items, modes }: { items: Rem[]; modes: Record<Mode, boolean> }) {
  const [q, setQ] = useState("");
  const [changing, setChanging] = useState<string>();
  const needle = q.trim().toLowerCase();
  const rows = items.filter((r) => !needle || r.key.includes(needle) || r.name.toLowerCase().includes(needle));
  const canSearch = modes.quick || modes.all;
  return (
    <main className="page" style={{ paddingBottom: 48 }}>
      <div className="page-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1>Remembered choices</h1>
          <p style={{ margin: 0 }} className="muted">
            When a line uses these words again, Grocery Cart picks this product.
          </p>
        </div>
        <input type="search" className="searchbox" aria-label="Search remembered choices" placeholder="Search words or products" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel" role="table" aria-label="Remembered choices" style={{ overflow: "hidden" }}>
        <div className="tr head rem-cols" role="row" style={{ padding: "10px 20px" }}>
          <span role="columnheader">Your words</span>
          <span role="columnheader">Product</span>
          <span role="columnheader" style={{ textAlign: "right" }}>
            Last price
          </span>
          <span role="columnheader">Last used</span>
          <span role="columnheader">
            <span className="sr-only">Actions</span>
          </span>
        </div>
        {rows.map((m) => (
          <Fragment key={m.key}>
            <div className="tr rem-cols" role="row" style={changing === m.key ? { borderBottom: "none" } : undefined}>
              <span role="cell" style={{ fontWeight: 600, fontSize: 15 }}>
                {m.key}
              </span>
              <div role="cell" className="prod-line" style={{ gap: 12 }}>
                <Thumb src={m.image} size={40} />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ overflowWrap: "anywhere" }}>{m.name}</span>
                  <span className="mono muted" style={{ fontSize: 12 }}>
                    {[m.packText, m.mode && MODE_LABEL[m.mode]].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </div>
              <span role="cell" className="money">
                {rupees(m.lastPrice)}
              </span>
              <span role="cell" className="mono muted" style={{ fontSize: 13 }}>
                {day(m.lastUsed)}
              </span>
              <div role="cell" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  className="btn-s"
                  aria-label={`Change product for ${m.key}`}
                  aria-expanded={changing === m.key}
                  disabled={!canSearch}
                  title={canSearch ? undefined : "Connect to JioMart first"}
                  onClick={() => setChanging(changing === m.key ? undefined : m.key)}
                >
                  Change
                </button>
                <button className="btn-s bad" aria-label={`Forget ${m.key}`} onClick={() => void act("forget", { key: m.key })}>
                  Forget
                </button>
              </div>
            </div>
            {changing === m.key && <ChangePanel item={m} modes={modes} onDone={() => setChanging(undefined)} />}
          </Fragment>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center" }} className="muted">
            {items.length ? `No remembered choice matches “${q}”.` : "Nothing remembered yet. Pick a different product in Review and keep “Remember for next time” ticked."}
          </div>
        )}
      </div>
    </main>
  );
}

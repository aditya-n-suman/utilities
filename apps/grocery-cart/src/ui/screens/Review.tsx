// A4 Review: tabs, Change (alternatives), Search, pack stepper, Skip, Remember. Delivery chips and
// "Search Shop all for this" are additions for Quick / Shop all.

import { useState } from "react";
import type { Mode } from "../../engine/jiomart/api.ts";
import type { Candidate } from "../../engine/match.ts";
import type { Row, RunState } from "../../engine/run.ts";
import { act } from "../api.ts";
import { MatchChip, MODE_LABEL, Thumb, Yours } from "../bits.tsx";
import { plural, rupees } from "../format.ts";
import { PauseBanner } from "./PauseBanner.tsx";

type Tab = "all" | "look" | "nf" | "ready" | "skipped";
const live = (r: Row) => !r.skipped && r.search === "done";
const FILTERS: Record<Tab, { label: string; test: (r: Row) => boolean }> = {
  all: { label: "All", test: () => true },
  look: { label: "Needs a look", test: (r) => live(r) && !!r.chosen && r.confidence !== "high" },
  nf: { label: "Not found", test: (r) => live(r) && !r.chosen },
  ready: { label: "Ready", test: (r) => live(r) && !!r.chosen && r.confidence === "high" },
  skipped: { label: "Skipped", test: (r) => r.skipped },
};

function perUnit(c: Candidate): string {
  const p = c.pricePerUnit;
  if (!p) return "price per unit unknown";
  return p.per === "pack" ? "per pack" : `${rupees(p.value)}/${p.per}`;
}

function packWord(r: Row): string {
  if (r.qtyText.startsWith("x")) return r.chosen?.packs === 1 ? "pc" : "pcs";
  return r.chosen?.packs === 1 ? "pack" : "packs";
}

function ReviewRow({ r, open, setOpen, searching, setSearching }: {
  r: Row;
  open: boolean;
  setOpen: (o: boolean) => void;
  searching: boolean;
  setSearching: (o: boolean) => void;
}) {
  const [words, setWords] = useState("");
  const c = r.chosen;
  const p = c?.product;
  const isLive = live(r);
  const showSearch = isLive && (!c || searching);
  const otherMode: Mode = r.mode === "quick" ? "all" : "quick";
  const options = c ? [c, ...r.alternatives] : [];
  const pick = (uid: number) => {
    setOpen(false);
    void act("choose", { line: r.line, uid });
  };

  return (
    <div className="tr cols-review" role="row">
      <Yours query={r.query} qtyText={r.qtyText} note={r.note} />
      <div role="cell" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {r.search !== "done" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--accent-text)", fontWeight: 500 }}>
            <span className="spin" aria-hidden="true" />
            Searching JioMart{r.searchedFor !== r.query ? ` for “${r.searchedFor}”` : ""}…
          </div>
        )}
        {isLive && c && p && (
          <>
            <div className="product">
              <Thumb src={p.image} size={52} />
              <div className="info">
                <span className="pname">{p.name}</span>
                <span className="sub">
                  {[p.brand && p.brand.replace(/\b\w/g, (x) => x.toUpperCase()), p.pack ? `${p.pack.value} ${p.pack.unit}` : p.packText].filter(Boolean).join(" · ")}
                  <span className="deliv">{MODE_LABEL[r.mode]}</span>
                </span>
                <div className="prices">
                  <span className="price">{rupees(p.price)}</span>
                  {p.mrp !== undefined && p.price !== undefined && p.mrp > p.price && <s aria-label={`MRP ${rupees(p.mrp)}`}>{rupees(p.mrp)}</s>}
                  {!p.sellable && <span className="tag-bad">Out of stock</span>}
                </div>
              </div>
              <div className="tot">
                <span className="covers">{c.covers}</span>
                <span className="money">{rupees(c.lineTotal)}</span>
              </div>
            </div>
            {r.confidence !== "high" && c.issues.length > 0 && <p className="issues">{c.issues.join(" · ")}</p>}
            {r.changed && (
              <label className="remember">
                <input type="checkbox" checked={r.remember} onChange={(e) => void act("remember", { line: r.line, remember: e.target.checked })} />
                Remember for next time
              </label>
            )}
          </>
        )}
        {isLive && !c && (
          <p style={{ margin: 0 }} className="muted">
            Nothing on JioMart{r.mode === "quick" ? " Quick" : ""} matched “{r.searchedFor}”. Try other words
            {r.mode === "quick" ? " or Shop all" : ""}.
          </p>
        )}
        {r.skipped && (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }} className="muted">
            Skipped. It won't be added.
            <button className="btn-s" style={{ height: 28 }} onClick={() => void act("skip", { line: r.line, skipped: false })}>
              Undo
            </button>
          </div>
        )}
        {showSearch && (
          <form
            role="search"
            className="hand-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (!words.trim()) return;
              setSearching(false);
              void act("search", { line: r.line, words });
            }}
          >
            <input
              type="search"
              value={words}
              onChange={(e) => setWords(e.target.value)}
              aria-label={`Search JioMart by hand for ${r.query}`}
              placeholder={`Search JioMart, e.g. ${r.query} powder`}
            />
            <button type="submit">Search</button>
          </form>
        )}
        {open && c && (
          <div className="listbox" role="listbox" aria-label={`Alternatives for ${r.query}`}>
            <div className="lb-head">Best match first</div>
            {options.map((o) => (
              <div
                key={o.product.uid}
                className="option"
                role="option"
                aria-selected={o === c}
                tabIndex={0}
                onClick={() => pick(o.product.uid)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(o.product.uid);
                  }
                  if (e.key === "Escape") setOpen(false);
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
                  <span className="o-tag">{o === c ? "Selected" : ""}</span>
                </div>
              </div>
            ))}
            {options.length === 1 && <div className="lb-head" style={{ borderTop: "1px solid var(--line)" }}>No other products found. Use Search for other words.</div>}
          </div>
        )}
      </div>
      <div role="cell" className="actions">
        <div className="row">
          {r.search === "done" && !r.skipped && <MatchChip confidence={c ? r.confidence : "none"} />}
          {isLive && r.remembered && !r.changed && <span className="chip outline">Remembered</span>}
        </div>
        {isLive && c && (
          <>
            <div className="row">
              <button className="btn-s" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? "Done" : "Change"}
              </button>
              <button className="btn-s" aria-expanded={searching} onClick={() => setSearching(!searching)}>
                Search
              </button>
              <button className="btn-s" onClick={() => void act("skip", { line: r.line, skipped: true })}>
                Skip
              </button>
            </div>
            <div className="stepper" role="group" aria-label={`Pack count for ${r.query}`}>
              <button aria-label="One pack fewer" disabled={c.packs <= 1} onClick={() => void act("packs", { line: r.line, packs: c.packs - 1 })}>
                −
              </button>
              <span aria-live="polite">
                {c.packs} {packWord(r)}
              </span>
              <button
                aria-label="One pack more"
                disabled={p?.maxQty !== undefined && c.packs >= p.maxQty}
                onClick={() => void act("packs", { line: r.line, packs: c.packs + 1 })}
              >
                +
              </button>
            </div>
          </>
        )}
        {isLive && !c && (
          <div className="row">
            {r.mode === "quick" && (
              <button className="btn-s" onClick={() => void act("search", { line: r.line, mode: otherMode })}>
                Search Shop all for this
              </button>
            )}
            <button className="btn-s" onClick={() => void act("skip", { line: r.line, skipped: true })}>
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Review({ run, allModeKnown }: { run: RunState; allModeKnown: boolean }) {
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState<number>();
  const [searching, setSearching] = useState<number>();
  const counts = Object.fromEntries((Object.keys(FILTERS) as Tab[]).map((t) => [t, run.rows.filter(FILTERS[t].test).length])) as Record<Tab, number>;
  const rows = run.rows.filter(FILTERS[tab].test);
  const c = run.counts;
  const toAdd = run.rows.filter((r) => live(r) && r.chosen && r.add !== "added");
  const byMode = { quick: toAdd.filter((r) => r.mode === "quick").length, all: toAdd.filter((r) => r.mode === "all").length };
  const total = Math.round(toAdd.reduce((n, r) => n + (r.chosen?.lineTotal ?? 0), 0));
  const nothing = c.total > 0 && c.notFound === c.total;

  return (
    <>
      <main style={{ flex: 1 }}>
        <div className="review-head">
          <div className="band-head" style={{ alignItems: "flex-end" }}>
            <h1>Review your cart</h1>
            <button className="linkish" onClick={() => void act("reset")}>
              Edit list
            </button>
          </div>
          {run.paused && <PauseBanner pause={run.paused} done={c.searched} total={c.total} />}
          <div className="tabs" role="tablist" aria-label="Filter rows">
            {(Object.keys(FILTERS) as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {FILTERS[t].label}
                <span className="count">{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>
        {nothing ? (
          <div style={{ padding: 28, display: "flex", justifyContent: "center" }}>
            <div className="err-card" role="alert">
              <span className="bang" aria-hidden="true">
                !
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <strong>None of the {c.total} items were found</strong>
                <span className="muted" style={{ fontSize: 14.5 }}>
                  Check the Chrome window shows JioMart and your pincode{run.mode === "quick" && allModeKnown ? ", or try Shop all" : ""}, then search again.
                </span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" onClick={() => void act("reset")}>
                  Back to list
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="table" role="table" aria-label="Review">
            {rows.map((r) => (
              <ReviewRow
                key={r.line}
                r={r}
                open={open === r.line}
                setOpen={(o) => setOpen(o ? r.line : undefined)}
                searching={searching === r.line}
                setSearching={(o) => setSearching(o ? r.line : undefined)}
              />
            ))}
            {rows.length === 0 && <div className="tr muted" style={{ justifyContent: "center", padding: 32 }}>Nothing here.</div>}
          </div>
        )}
      </main>
      <footer className="foot">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            <span className="mono">{toAdd.length}</span> {toAdd.length === 1 ? "item" : "items"} to add · estimated <span className="mono">{rupees(total)}</span>
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {byMode.quick && byMode.all
              ? `${byMode.quick} Quick · ${byMode.all} Shop all. JioMart delivers them separately. `
              : ""}
            Prices are JioMart's, as of this search
          </span>
        </div>
        <button className="btn lg" disabled={!toAdd.length || !!run.paused} onClick={() => void act("add")}>
          Add {plural(toAdd.length, "item")} to JioMart cart
        </button>
      </footer>
    </>
  );
}

// A3 Finding products: live progress, rows fill in as each search lands.

import type { RunState } from "../../engine/run.ts";
import { act } from "../api.ts";
import { MatchChip, Thumb, Yours } from "../bits.tsx";
import { rupees } from "../format.ts";
import { PauseBanner } from "./PauseBanner.tsx";

export function Finding({ run }: { run: RunState }) {
  const c = run.counts;
  const left = c.total - c.searched;
  const minutes = Math.max(1, Math.round((left * 1.5) / 60));
  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="band ruled">
        <div className="band-head">
          <h1>Finding products</h1>
          <span className="muted" style={{ fontSize: 14, display: "flex", gap: 16, alignItems: "baseline" }}>
            One item at a time, like a person would. About {minutes} {minutes === 1 ? "minute" : "minutes"}.
            <button className="linkish" style={{ fontSize: 13.5 }} onClick={() => void act("reset")}>
              Stop and edit list
            </button>
          </span>
        </div>
        <div className="bar" role="progressbar" aria-label="Searched" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.searched}>
          <div style={{ width: `${c.total ? (c.searched / c.total) * 100 : 0}%` }} />
        </div>
        <div className="stats" aria-live="polite">
          <span>
            <span className="mono" style={{ fontWeight: 600 }}>
              {c.searched} / {c.total}
            </span>{" "}
            searched
          </span>
          <span className="muted">
            <span className="mono">{c.high}</span> good match · <span className="mono">{c.check}</span> check this · <span className="mono">{c.notFound}</span> not found
          </span>
        </div>
        {run.paused && <PauseBanner pause={run.paused} done={c.searched} total={c.total} />}
      </div>
      <div className="table" role="table" aria-label="Search results">
        <div className="tr head cols-find" role="row">
          <span role="columnheader">Your list</span>
          <span role="columnheader">Product</span>
          <span role="columnheader">Match</span>
        </div>
        {run.rows.map((r) => (
          <div className="tr cols-find" role="row" key={r.line}>
            <Yours query={r.query} qtyText={r.qtyText} note={r.note} />
            <div role="cell" style={{ minWidth: 0 }}>
              {r.search === "done" && r.chosen && (
                <div className="prod-line">
                  <Thumb src={r.chosen.product.image} size={40} />
                  <span className="pname">{r.chosen.product.name}</span>
                  <span className="covers">{r.chosen.covers}</span>
                  <span className="money" style={{ minWidth: 64 }}>
                    {rupees(r.chosen.lineTotal)}
                  </span>
                </div>
              )}
              {r.search === "done" && !r.chosen && <span className="muted">Nothing on JioMart matched.</span>}
              {r.search === "searching" && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--accent-text)", fontWeight: 500 }}>
                  <span className="spin" aria-hidden="true" />
                  Searching JioMart…
                </div>
              )}
              {r.search === "pending" && (
                <div aria-label="Waiting to search" style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div className="skel" style={{ width: 40, height: 40, borderRadius: 7 }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="skel" style={{ height: 10, width: "62%" }} />
                    <div className="skel" style={{ height: 10, width: "34%" }} />
                  </div>
                </div>
              )}
            </div>
            <div role="cell">
              {r.search === "done" ? <MatchChip confidence={r.confidence} /> : r.search === "pending" ? <div className="skel" style={{ height: 20, width: 84, borderRadius: 999 }} /> : null}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

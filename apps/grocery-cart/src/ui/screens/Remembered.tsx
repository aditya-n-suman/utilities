// A7 Remembered choices: searchable, Forget. (The design's "Change" happens in Review: pick another product
// with "Remember for next time" ticked.)

import { useState } from "react";
import type { Remembered as Rem } from "../../engine/remembered.ts";
import { act } from "../api.ts";
import { MODE_LABEL, Thumb } from "../bits.tsx";
import { day, rupees } from "../format.ts";

export function Remembered({ items }: { items: Rem[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = items.filter((r) => !needle || r.key.includes(needle) || r.name.toLowerCase().includes(needle));
  return (
    <main className="page" style={{ paddingBottom: 48 }}>
      <div className="page-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1>Remembered choices</h1>
          <p style={{ margin: 0 }} className="muted">
            When a line uses these words again, Grocery Cart picks this product. To change one, pick another product in Review.
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
          <div className="tr rem-cols" role="row" key={m.key}>
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
            <div role="cell" style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-s bad" aria-label={`Forget ${m.key}`} onClick={() => void act("forget", { key: m.key })}>
                Forget
              </button>
            </div>
          </div>
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

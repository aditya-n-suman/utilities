// A5 Adding: one line at a time, Pause / Resume, the pause banner, per-line result.

import type { CartErrorCode, ShopErrorCode } from "../../engine/jiomart/client.ts";
import type { RunState } from "../../engine/run.ts";
import { act } from "../api.ts";
import { Thumb, Yours } from "../bits.tsx";
import { rupees } from "../format.ts";
import { PauseBanner } from "./PauseBanner.tsx";

export const ADD_ERRORS: Record<CartErrorCode | ShopErrorCode, string> = {
  out_of_stock: "Out of stock now",
  qty_limit: "Quantity limit reached",
  not_in_cart: "JioMart error",
  shop_error: "JioMart error",
  signed_out: "Signed out",
  human_check: "Human check",
  rate_limited: "Slowed down",
  shop_changed: "JioMart error",
  mode_unknown: "Mode not learnt",
  network: "Chrome not reachable",
};

export function Adding({ run }: { run: RunState }) {
  const rows = run.rows.filter((r) => r.add !== "none");
  const added = rows.filter((r) => r.add === "added" || r.add === "failed").length;
  const current = Math.min(rows.length, added + 1);
  return (
    <main style={{ flex: 1 }}>
      <div className="band">
        <div className="band-head" style={{ alignItems: "center" }}>
          <h1>
            Adding{" "}
            <span className="mono" style={{ fontWeight: 500 }}>
              {current} / {rows.length}
            </span>
          </h1>
          {run.paused ? (
            <span className="chip check" style={{ fontSize: 13, padding: "4px 10px" }}>
              Paused
            </span>
          ) : (
            <button className="btn-m" onClick={() => void act("pause")}>
              Pause
            </button>
          )}
        </div>
        <div className="bar" role="progressbar" aria-label="Added" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={added}>
          <div style={{ width: `${rows.length ? (added / rows.length) * 100 : 0}%` }} />
        </div>
        {run.paused && <PauseBanner pause={run.paused} done={added} total={rows.length} />}
      </div>
      <div className="table" role="table" aria-label="Adding to cart" style={{ borderTop: "1px solid var(--line)" }}>
        {rows.map((r) => (
          <div className="tr cols-add" role="row" key={r.line} style={{ opacity: r.add === "waiting" ? 0.6 : 1, borderTop: "none", borderBottom: "1px solid var(--line)" }}>
            <Yours query={r.query} qtyText={r.qtyText} />
            <div role="cell" className="prod-line" style={{ gap: 12 }}>
              <Thumb src={r.chosen?.product.image} size={32} />
              <span style={{ overflowWrap: "anywhere" }}>{r.chosen?.product.name}</span>
              <span className="covers" style={{ marginLeft: "auto", fontSize: 12 }}>
                {r.chosen?.covers}
              </span>
            </div>
            <div role="cell" className="money">
              {rupees(r.chosen?.lineTotal)}
            </div>
            <div role="cell" style={{ fontSize: 13.5 }}>
              {r.add === "added" &&
                (r.addedPacks ? (
                  <span style={{ color: "var(--warn-text)", fontWeight: 600 }} title={r.addMessage}>
                    Added {r.addedPacks} of {r.chosen?.packs} · low stock
                  </span>
                ) : (
                  <span style={{ color: "var(--accent-text)", fontWeight: 600 }}>Added ✓</span>
                ))}
              {r.add === "adding" && (
                <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                  <span className={`spin${run.paused ? " warn" : ""}`} aria-hidden="true" />
                  {run.paused ? "Adding… paused" : "Adding…"}
                </span>
              )}
              {r.add === "waiting" && <span className="muted">Waiting</span>}
              {r.add === "failed" && (
                <span className="bad" style={{ fontWeight: 600 }} title={r.addMessage}>
                  Failed · {ADD_ERRORS[r.addError ?? "shop_error"]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

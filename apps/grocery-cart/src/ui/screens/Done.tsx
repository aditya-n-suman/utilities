// A6 Done: how many were added, open the cart, retry failures, what to buy elsewhere.

import { useState } from "react";
import type { RunState } from "../../engine/run.ts";
import { act } from "../api.ts";
import { Copy } from "../bits.tsx";
import { ADD_ERRORS } from "./Adding.tsx";

export function Done({ run, undoable }: { run: RunState; undoable: number }) {
  const [confirmUndo, setConfirmUndo] = useState(false);
  const tried = run.rows.filter((r) => r.add === "added" || r.add === "failed");
  const added = tried.filter((r) => r.add === "added").length;
  const failed = tried.length - added;
  const elsewhere = run.rows
    .filter((r) => !r.skipped && (r.add === "failed" || (r.search === "done" && !r.chosen)))
    .map((r) => ({ r, reason: r.add === "failed" ? `Failed · ${ADD_ERRORS[r.addError ?? "shop_error"].toLowerCase()}` : "Not found" }));
  return (
    <main className="center" style={{ padding: "64px 28px 72px" }}>
      <div className="col" style={{ maxWidth: 680, gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="big">
            <span className="mono" style={{ fontWeight: 500 }}>
              {added}
            </span>{" "}
            of{" "}
            <span className="mono" style={{ fontWeight: 500 }}>
              {tried.length}
            </span>{" "}
            added
          </h1>
          <p className="lede" style={{ fontSize: 15.5 }}>
            Your JioMart cart is filled. Check it and pay on JioMart yourself.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn lg" onClick={() => void act("open", { what: "cart" })}>
            Open cart in Chrome
          </button>
          {failed > 0 && (
            <button className="btn lg ghost" onClick={() => void act("add", { onlyFailed: true })}>
              Retry {failed} failed
            </button>
          )}
          <button className="btn lg ghost" onClick={() => void act("review")}>
            Back to review
          </button>
          <button className="btn lg ghost" onClick={() => void act("reset")}>
            New list
          </button>
        </div>
        {undoable > 0 && (
          <div className="panel" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <span className="muted" style={{ fontSize: 14 }}>
              {confirmUndo
                ? `Take back the ${undoable} ${undoable === 1 ? "product" : "products"} this run added? Products that were already in your cart go back to their earlier quantity.`
                : "Changed your mind? Take back what this run added, without touching the rest of your cart."}
            </span>
            {confirmUndo ? (
              <div style={{ display: "flex", gap: 8, flex: "none" }}>
                <button className="btn-m" onClick={() => setConfirmUndo(false)}>
                  Cancel
                </button>
                <button
                  className="btn danger"
                  style={{ height: 36 }}
                  onClick={() => {
                    setConfirmUndo(false);
                    void act("cart/undo-run");
                    location.hash = "#cart";
                  }}
                >
                  Yes, undo
                </button>
              </div>
            ) : (
              <button className="btn-m" style={{ flex: "none" }} onClick={() => setConfirmUndo(true)}>
                Undo this run
              </button>
            )}
          </div>
        )}
        {elsewhere.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <strong style={{ fontSize: 15 }}>Buy these elsewhere</strong>
              <Copy text={elsewhere.map(({ r }) => r.raw).join("\n")} label="Copy as text" />
            </div>
            {elsewhere.map(({ r, reason }) => (
              <div className="panel-row" key={r.line}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{r.query}</span>
                  <span className="qty">{r.qtyText}</span>
                  {r.note && (
                    <span lang="hi" className="muted">
                      {r.note}
                    </span>
                  )}
                </div>
                <span className="bad" style={{ fontSize: 13, fontWeight: 500 }}>
                  {reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

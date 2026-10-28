// Your JioMart cart: select lines and remove them in one go (JioMart's own cart page reloads after every change).
// Not in the design canvas; built from its patterns: Remembered's page head, Review's tabs and sticky footer,
// Adding's progress band and pause banner.

import { useEffect, useMemo, useState } from "react";
import type { CartLine } from "../../engine/jiomart/api.ts";
import { act, type AppState } from "../api.ts";
import { Thumb } from "../bits.tsx";
import { plural, rupees } from "../format.ts";
import { PauseBanner } from "./PauseBanner.tsx";

type Filter = "all" | "run" | "quick" | "standard";

const deliveryOf = (l: CartLine) => (l.journey === "quickcommerce" ? "Quick" : l.journey ? "Scheduled" : "");

export function CartScreen({ state }: { state: AppState }) {
  const { cart, tidy } = state;
  const runUids = useMemo(() => new Set(state.run.rows.filter((r) => r.add === "added" && r.addedUid !== undefined && !r.undone).map((r) => r.addedUid!)), [state.run.rows]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  // Read the cart when the page opens (and it isn't busy removing).
  useEffect(() => {
    if (tidy.phase !== "removing") void act("cart/load");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Forget selections for lines that are gone.
  useEffect(() => {
    setSelected((sel) => new Set([...sel].filter((uid) => cart.lines.some((l) => l.uid === uid))));
  }, [cart.lines]);

  const tests: Record<Filter, (l: CartLine) => boolean> = {
    all: () => true,
    run: (l) => runUids.has(l.uid),
    quick: (l) => l.journey === "quickcommerce",
    standard: (l) => !!l.journey && l.journey !== "quickcommerce",
  };
  const labels: Record<Filter, string> = { all: "All", run: "Added by Grocery Cart", quick: "Quick", standard: "Scheduled" };
  const shown = cart.lines.filter(tests[filter]);
  const allShownSelected = shown.length > 0 && shown.every((l) => selected.has(l.uid));
  const chosen = cart.lines.filter((l) => selected.has(l.uid));
  const chosenTotal = Math.round(chosen.reduce((n, l) => n + (l.price ?? 0) * l.quantity, 0));
  const removing = tidy.phase === "removing";

  const toggle = (uid: number) =>
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  const toggleShown = () =>
    setSelected((sel) => {
      const next = new Set(sel);
      for (const l of shown) {
        if (allShownSelected) next.delete(l.uid);
        else next.add(l.uid);
      }
      return next;
    });
  const remove = () => {
    setConfirming(false);
    void act("cart/remove", { targets: chosen.map((l) => ({ uid: l.uid, name: l.name, toQuantity: 0 })) });
    setSelected(new Set());
  };

  return (
    <>
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="review-head" style={{ background: "var(--bg)" }}>
          <div className="page-head">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h1>Your JioMart cart</h1>
              <p style={{ margin: 0 }} className="muted">
                {cart.loadedAt
                  ? `${plural(cart.lines.length, "line")} · ${rupees(cart.total)}. Select what to remove; Grocery Cart removes them one by one, so JioMart's page doesn't have to reload for each.`
                  : cart.loading
                    ? "Reading your cart…"
                    : "Your cart hasn't been read yet."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-m" disabled={cart.loading || removing} onClick={() => void act("cart/load")}>
                {cart.loading ? "Reading…" : "Refresh"}
              </button>
              <button className="btn-m" onClick={() => void act("open", { what: "cart" })}>
                Open in Chrome
              </button>
            </div>
          </div>
          {cart.error && (
            <span className="bad" role="alert">
              Couldn't read the cart: {cart.error}
            </span>
          )}
          {tidy.phase !== "idle" && (
            <div className="band" style={{ padding: 0, gap: 10 }}>
              <div className="band-head" style={{ alignItems: "center" }}>
                <strong style={{ fontSize: 17 }}>
                  {removing ? "Removing " : "Removed "}
                  <span className="mono" style={{ fontWeight: 500 }}>
                    {tidy.done - tidy.failed.length} / {tidy.total}
                  </span>
                </strong>
                {removing && !tidy.paused && (
                  <button className="btn-m" onClick={() => void act("cart/pause")}>
                    Pause
                  </button>
                )}
                {tidy.phase === "done" && (
                  <button className="linkish" onClick={() => void act("cart/reset")}>
                    Dismiss
                  </button>
                )}
              </div>
              <div className="bar" role="progressbar" aria-label="Removed" aria-valuemin={0} aria-valuemax={tidy.total} aria-valuenow={tidy.done}>
                <div style={{ width: `${tidy.total ? (tidy.done / tidy.total) * 100 : 0}%` }} />
              </div>
              {tidy.paused && <PauseBanner pause={tidy.paused} done={tidy.done} total={tidy.total} resumeAction="cart/resume" />}
              {tidy.failed.length > 0 && (
                <span className="bad" style={{ fontSize: 13.5 }}>
                  Couldn't remove: {tidy.failed.map((f) => `${f.name ?? f.uid} (${f.message})`).join(", ")}
                </span>
              )}
            </div>
          )}
          <div className="tabs" role="tablist" aria-label="Filter cart lines">
            {(Object.keys(labels) as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {labels[f]}
                <span className="count">{cart.lines.filter(tests[f]).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="table" role="table" aria-label="Cart lines">
          <div className="tr head cols-cart" role="row">
            <span role="columnheader">
              <input type="checkbox" className="tick" aria-label="Select all shown" checked={allShownSelected} disabled={!shown.length || removing} onChange={toggleShown} />
            </span>
            <span role="columnheader">Product</span>
            <span role="columnheader">Qty</span>
            <span role="columnheader" style={{ textAlign: "right" }}>
              Price
            </span>
          </div>
          {shown.map((l) => (
            <label className="tr cols-cart" role="row" key={l.uid} style={{ cursor: removing ? "default" : "pointer", opacity: tidy.current === l.uid ? 0.55 : 1 }}>
              <span role="cell">
                <input type="checkbox" className="tick" aria-label={`Select ${l.name ?? l.uid}`} checked={selected.has(l.uid)} disabled={removing} onChange={() => toggle(l.uid)} />
              </span>
              <div role="cell" className="prod-line" style={{ gap: 12 }}>
                <Thumb src={l.image} size={40} />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ overflowWrap: "anywhere" }}>{l.name ?? `Product ${l.uid}`}</span>
                  <span className="muted" style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
                    {deliveryOf(l) && <span className="deliv">{deliveryOf(l)}</span>}
                    {runUids.has(l.uid) && <span className="chip outline" style={{ padding: "0 7px" }}>Added by Grocery Cart</span>}
                    {l.outOfStock && <span className="tag-bad">Out of stock</span>}
                    {tidy.current === l.uid && "Removing…"}
                  </span>
                </div>
              </div>
              <span role="cell" className="mono">
                {l.quantity}
              </span>
              <span role="cell" className="money">
                {l.price !== undefined ? rupees(l.price * l.quantity) : "₹–"}
              </span>
            </label>
          ))}
          {cart.loadedAt && shown.length === 0 && (
            <div className="tr muted" style={{ justifyContent: "center", padding: 32 }}>
              {cart.lines.length ? "Nothing here." : "Your cart is empty."}
            </div>
          )}
        </div>
      </main>
      <footer className="foot">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {chosen.length ? (
              <>
                <span className="mono">{chosen.length}</span> selected · <span className="mono">{rupees(chosenTotal)}</span>
              </>
            ) : (
              "Nothing selected"
            )}
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {confirming ? "This removes them from your JioMart cart. Adding them back means searching again." : "Removes whole lines, one at a time."}
          </span>
        </div>
        {confirming ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn lg ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button className="btn lg danger" onClick={remove}>
              Yes, remove {plural(chosen.length, "line")}
            </button>
          </div>
        ) : (
          <button className="btn lg danger" disabled={!chosen.length || removing} onClick={() => setConfirming(true)}>
            Remove {chosen.length ? plural(chosen.length, "line") : "selected"}
          </button>
        )}
      </footer>
    </>
  );
}

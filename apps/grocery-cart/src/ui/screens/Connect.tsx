// A1 Connect: Chrome, sign-in, pincode, and (added for Quick / Shop all) which delivery modes are learnt.

import { useEffect } from "react";
import { act, type AppState } from "../api.ts";
import { Cmd } from "../bits.tsx";

function Mark({ state }: { state: "ok" | "problem" | "waiting" }) {
  if (state === "ok") return <span className="state-ok" role="img" aria-label="OK">✓</span>;
  if (state === "problem") return <span className="state-bad" role="img" aria-label="Problem">!</span>;
  return <span className="state-wait" role="img" aria-label="Waiting" />;
}

export function Connect({ state, onContinue }: { state: AppState; onContinue: () => void }) {
  const c = state.connection;
  const ready = c.chrome === "ok" && c.signedIn === "ok" && !!c.pincode;
  const modesOk = c.modes.quick && c.modes.all;

  // Re-check while something is missing; the server also pushes changes it sees in the tab.
  useEffect(() => {
    if (ready && modesOk) return;
    const t = setInterval(() => void act("check"), 3000);
    return () => clearInterval(t);
  }, [ready, modesOk]);

  return (
    <main className="center">
      <div className="col" style={{ maxWidth: 600 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1>Connect to JioMart</h1>
          <p className="lede">Grocery Cart fills your cart in a separate Chrome window. It never checks out or pays.</p>
        </div>
        <ul className="checklist" aria-label="Connection checklist">
          <li className={c.chrome === "problem" ? "warn" : ""}>
            <Mark state={c.chrome} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="title">Chrome is open for Grocery Cart</span>
                {c.chrome === "problem" && <span className="sub">Start it from a terminal in apps/grocery-cart. This page reconnects on its own.</span>}
                {c.chrome === "waiting" && <span className="sub muted">Checking…</span>}
              </div>
              {c.chrome === "problem" && <Cmd />}
            </div>
          </li>
          <li className={c.chrome === "ok" && c.signedIn === "problem" ? "warn" : ""}>
            <Mark state={c.chrome === "ok" ? c.signedIn : "waiting"} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="title" style={c.chrome !== "ok" ? { color: "var(--muted)" } : undefined}>
                  Signed in to JioMart
                </span>
                {c.chrome === "ok" && c.signedIn === "problem" && <span className="sub">Not signed in yet in the Grocery Cart Chrome window.</span>}
                {c.chrome !== "ok" && <span className="sub muted">Checked once Chrome is open.</span>}
              </div>
              {c.chrome === "ok" && c.signedIn === "problem" && (
                <button className="btn-m" onClick={() => void act("open", { what: "home" })}>
                  Open JioMart sign-in
                </button>
              )}
            </div>
          </li>
          <li>
            <Mark state={c.pincode ? "ok" : "waiting"} />
            {c.pincode ? (
              <span className="title">
                Delivering to <span className="mono">{c.pincode}</span>
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="title muted">Delivery pincode</span>
                <span className="sub muted">Checked after you sign in.</span>
              </div>
            )}
            {c.pincode && (
              <button className="linkish" style={{ fontSize: 13.5 }} onClick={() => void act("open", { what: "home" })}>
                Change on JioMart
              </button>
            )}
          </li>
          <li className={ready && !modesOk ? "warn" : ""}>
            <Mark state={modesOk ? "ok" : ready ? "problem" : "waiting"} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="title" style={!ready ? { color: "var(--muted)" } : undefined}>
                Learnt Quick and Shop all
              </span>
              {!modesOk && (
                <span className="sub">
                  {ready
                    ? `On JioMart, switch to ${!c.modes.quick ? "Quick" : "Shop all"} and search for anything once. Needed once per pincode.`
                    : "Checked after you sign in."}
                  {ready && (c.modes.quick || c.modes.all) && ` ${c.modes.quick ? "Quick" : "Shop all"} is ready already.`}
                </span>
              )}
            </div>
          </li>
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16 }}>
          {ready && !modesOk && <span className="muted" style={{ fontSize: 13 }}>You can continue with the mode that's ready.</span>}
          <button className="btn" disabled={!ready || !(c.modes.quick || c.modes.all)} onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    </main>
  );
}

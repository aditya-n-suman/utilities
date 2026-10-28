// Screens follow the run: Connect → Paste list → Finding → Review → Adding → Done (design A1–A6),
// with Remembered choices (A7) at #remembered.

import { useEffect, useState } from "react";
import { type AppState, useAppState } from "./api.ts";
import { Adding } from "./screens/Adding.tsx";
import { Connect } from "./screens/Connect.tsx";
import { Done } from "./screens/Done.tsx";
import { Finding } from "./screens/Finding.tsx";
import { ListScreen } from "./screens/ListScreen.tsx";
import { Remembered } from "./screens/Remembered.tsx";
import { Review } from "./screens/Review.tsx";

type Screen = "connect" | "list" | "finding" | "review" | "adding" | "done" | "remembered";
const STEP: Partial<Record<Screen, [number, string]>> = {
  connect: [1, "Connect"],
  list: [2, "Paste list"],
  finding: [3, "Find products"],
  review: [4, "Review"],
  adding: [5, "Add to cart"],
  done: [6, "Done"],
};

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function screenOf(s: AppState, continued: boolean, hash: string): Screen {
  if (hash === "#remembered") return "remembered";
  const phase = s.run.phase;
  if (phase !== "idle") return phase === "finding" ? "finding" : phase;
  return continued ? "list" : "connect";
}

export function App() {
  const { state, online } = useAppState();
  const hash = useHash();
  const [continued, setContinued] = useState(() => sessionStorage.getItem("gc-continued") === "1");
  const go = () => {
    sessionStorage.setItem("gc-continued", "1");
    setContinued(true);
  };

  if (!state) {
    return (
      <div className="app">
        <main className="center">
          <div className="err-card" role="alert">
            <span className="bang" aria-hidden="true">
              !
            </span>
            <strong>{online ? "Loading…" : "Grocery Cart isn't running"}</strong>
            {!online && <span className="muted">Start it with ./instruction.sh start, then reload this page.</span>}
          </div>
        </main>
      </div>
    );
  }

  const screen = screenOf(state, continued, hash);
  const step = STEP[screen];
  const c = state.connection;
  const connected = c.chrome === "ok" && c.signedIn === "ok";
  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#">
          <span className="brand-mark" aria-hidden="true" />
          Grocery Cart
        </a>
        <span className="step">
          {step && (
            <>
              <span className="mono">{step[0]}/6</span> {step[1]}
            </>
          )}
        </span>
        <nav aria-label="Main">
          {screen === "remembered" ? (
            <>
              <a href="#">Back</a>
              <a href="#remembered" aria-current="page">
                Remembered choices
              </a>
            </>
          ) : (
            <a href="#remembered">Remembered choices</a>
          )}
        </nav>
        {screen !== "connect" && (
          <span className="conn" title={connected ? "Connected to JioMart" : "Not connected"}>
            <span className={`dot${connected ? "" : " off"}`} aria-hidden="true" />
            JioMart{c.pincode ? " · " : ""}
            {c.pincode && <span className="mono">{c.pincode}</span>}
            {!connected && " · not connected"}
          </span>
        )}
      </header>
      {screen === "connect" && <Connect state={state} onContinue={go} />}
      {screen === "list" && <ListScreen state={state} />}
      {screen === "finding" && <Finding run={state.run} />}
      {screen === "review" && <Review run={state.run} allModeKnown={c.modes.all} />}
      {screen === "adding" && <Adding run={state.run} />}
      {screen === "done" && <Done run={state.run} />}
      {screen === "remembered" && <Remembered items={state.remembered} modes={c.modes} />}
    </div>
  );
}

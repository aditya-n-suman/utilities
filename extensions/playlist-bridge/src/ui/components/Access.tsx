import { useState } from "react";
import { SITES } from "@/platform/access";

type AccessState = "idle" | "waiting" | "denied";

/** Full-page "One more step" screen (mostly Firefox, where site access is granted after install). */
export function AccessScreen({ onAllow }: { onAllow: () => Promise<boolean> }) {
  const [state, setState] = useState<AccessState>("idle");
  const [showWhy, setShowWhy] = useState(false);

  const allow = async () => {
    setState("waiting");
    setState((await onAllow()) ? "idle" : "denied");
  };

  return (
    <section aria-labelledby="acc-h" className="card error-card access-card">
      <span aria-hidden="true" className="access-mark">
        <span className="dot green" />
        <span className="line" />
        <span className="dot red" />
      </span>
      <h1 id="acc-h">One more step</h1>
      <p>Playlist Bridge needs access to {SITES.length === 5 ? "five" : SITES.length} sites to read your playlist and find each song on YouTube.</p>
      <ul aria-label="Sites Playlist Bridge needs" className="site-list">
        {SITES.map((s) => (
          <li key={s.host}>
            <span className="mono">{s.host}</span>
            <span>{s.reason}</span>
          </li>
        ))}
      </ul>
      <p className="stays-local">
        <span aria-hidden="true">●</span>
        <span>Everything stays in your browser. Nothing is sent to us.</span>
      </p>
      {state === "denied" && (
        <p role="alert" className="access-denied">
          Access wasn’t granted. Playlist Bridge can’t work without it.
        </p>
      )}
      <div className="error-btns access-btns">
        <button type="button" className="btn btn-primary" onClick={allow} disabled={state === "waiting"} aria-busy={state === "waiting"}>
          {state === "waiting" && <span aria-hidden="true" className="spinner on-ink" />}
          <span>{state === "denied" ? "Try again" : "Allow access"}</span>
        </button>
        <button type="button" className="btn-link why" onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy} aria-controls="why-p">
          Why is this needed?
        </button>
      </div>
      {state === "waiting" && (
        <p role="status" className="access-waiting">
          Answer the prompt from your browser to continue.
        </p>
      )}
      {showWhy && (
        <p id="why-p" className="why-text">
          Your browser asks before an extension can talk to a website. Playlist Bridge reads the playlist from Spotify and
          searches YouTube for you, using the same pages you’d open yourself. It doesn’t touch any other site or your
          browsing history.
        </p>
      )}
    </section>
  );
}

/** Shown on top of any screen when access is revoked mid-flow. */
export function AccessLostBanner({ onAllow }: { onAllow: () => void }) {
  return (
    <div role="alert" className="banner warn access-lost">
      <p className="banner-title" style={{ margin: 0, flex: "1 1 300px", minWidth: 0 }}>
        Site access was turned off. Turn it back on to continue.
      </p>
      <button type="button" className="btn btn-primary" onClick={onAllow}>
        Allow access
      </button>
    </div>
  );
}

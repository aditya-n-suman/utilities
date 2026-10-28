// The banner shown when a run is paused (A5's human-check card; A8.1, A8.2 and A8.4 in banner form).

import type { Pause } from "../../engine/run.ts";
import { act } from "../api.ts";
import { Cmd } from "../bits.tsx";

const TEXT: Record<Pause["code"], { title: string; body: string }> = {
  human_check: { title: "JioMart wants to check you're human.", body: "Finish the check in the Chrome window, then click Resume." },
  signed_out: { title: "JioMart signed you out.", body: "Sign in again in the Chrome window, then Resume. Items already added stay in your cart." },
  rate_limited: { title: "JioMart asked us to slow down.", body: "Wait a minute, then click Resume. Nothing is lost." },
  network: { title: "Can't reach the Grocery Cart Chrome window.", body: "Start it from a terminal, then click Resume." },
  shop_changed: { title: "JioMart changed something.", body: "Grocery Cart couldn't read JioMart's answer. Try again; if it keeps happening, report a problem." },
  mode_unknown: { title: "This delivery mode isn't learnt yet.", body: "Search once on JioMart in that mode, then Resume." },
  user: { title: "Paused.", body: "Nothing more is sent to JioMart until you resume." },
};

const REPORT = "https://github.com/aditya-n-suman/utilities/issues/new?title=Grocery%20Cart%3A%20JioMart%20changed%20something";

export function PauseBanner({ pause, done, total, resumeAction = "resume" }: { pause: Pause; done: number; total: number; resumeAction?: string }) {
  const t = TEXT[pause.code];
  return (
    <div className="alert" role="alertdialog" aria-label="Paused">
      <span className="bang" aria-hidden="true">
        !
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <strong>
          {pause.code === "signed_out" ? `Paused at ${done} / ${total}. ` : ""}
          {t.title}
        </strong>
        <span className="body">{t.body}</span>
        {pause.code === "network" && <Cmd />}
      </div>
      <div className="acts">
        {pause.code === "signed_out" && (
          <button className="btn ghost" onClick={() => void act("open", { what: "home" })}>
            Open JioMart sign-in
          </button>
        )}
        {pause.code === "shop_changed" && (
          <a className="btn ghost" style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={REPORT} target="_blank" rel="noreferrer">
            Report a problem
          </a>
        )}
        <button className="btn lg" onClick={() => void act(resumeAction)}>
          {pause.code === "shop_changed" ? "Try again" : "Resume"}
        </button>
      </div>
    </div>
  );
}

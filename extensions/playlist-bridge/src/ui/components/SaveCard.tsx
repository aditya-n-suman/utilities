import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type PartialSave, type Privacy, type SaveProgress, type Saved, type Session } from "../api";
import { PRIVACY_HINT, SAVE_ERRORS } from "../copy";

const PRIVACIES: Privacy[] = ["private", "unlisted", "public"];
const YOUTUBE = "https://www.youtube.com/";

type YtState = "checking" | "in" | "out" | "waiting";
type Phase = "idle" | "saving" | "saved" | "expired" | "failed" | "partial";

interface Props {
  jobId: string;
  title: string;
  videoCount: number;
  announce: (msg: string) => void;
  copied: string;
  copy: (text: string, key: string) => void;
}

function Avatar({ session }: { session: Session }) {
  const [failed, setFailed] = useState(false);
  const name = session.name ?? "";
  if (session.avatar_url && !failed) {
    return <img className="avatar" src={session.avatar_url} alt={`Avatar for ${name}`} onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
  }
  return (
    <span role="img" aria-label={`Avatar for ${name}`} className="avatar initial">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** "Save to my YouTube account", using the YouTube session already signed in to this browser. */
export function SaveCard({ jobId, title, videoCount, announce, copied, copy }: Props) {
  const [yt, setYt] = useState<YtState>("checking");
  const [session, setSession] = useState<Session>({ signed_in: false });
  const [phase, setPhase] = useState<Phase>("idle");
  const [privacy, setPrivacy] = useState<Privacy>("unlisted");
  const [progress, setProgress] = useState<SaveProgress>({ added: 0, total: videoCount });
  const [saved, setSaved] = useState<Saved | null>(null);
  const [partial, setPartial] = useState<PartialSave | null>(null);
  const recheckOnReturn = useRef(false);

  const check = useCallback(async (fallback: YtState) => {
    try {
      const s = await api.session();
      setSession(s);
      setYt(s.signed_in ? "in" : fallback);
    } catch {
      setYt(fallback);
    }
  }, []);

  useEffect(() => {
    void check("out");
  }, [check]);

  // After "Sign in to YouTube ↗" or "Not you?", check again when the user comes back to this tab.
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible" || !recheckOnReturn.current) return;
      recheckOnReturn.current = false;
      void check(yt === "waiting" ? "waiting" : "out");
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [check, yt]);

  const startSignIn = () => {
    recheckOnReturn.current = true;
    setYt("waiting");
    setPhase("idle");
  };

  const save = async () => {
    setPhase("saving");
    announce("Saving to YouTube");
    try {
      const result = await api.save(jobId, { privacy, title }, setProgress);
      if ("failed" in result) {
        setPartial(result as PartialSave);
        setPhase("partial");
        announce(`Saved ${result.added} of ${result.added + result.failed} videos`);
      } else {
        setSaved(result);
        setPhase("saved");
        announce("Playlist saved to your YouTube account");
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "not_signed_in") {
        setYt("out");
        setPhase("expired");
      } else setPhase("failed");
    }
  };

  const onPrivacyKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    let i = PRIVACIES.indexOf(privacy);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") i = (i + 1) % 3;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = (i + 2) % 3;
    else return;
    e.preventDefault();
    setPrivacy(PRIVACIES[i]!);
    (e.currentTarget.parentElement?.children[i] as HTMLElement | undefined)?.focus();
  };

  const pct = progress.total ? `${Math.round((progress.added / progress.total) * 100)}%` : "0%";

  return (
    <div className="card side-card">
      <h2>Save to my YouTube account</h2>
      <p className="lead">One playlist with all {videoCount} videos and a permanent link you can share.</p>

      {yt === "checking" && phase === "idle" && (
        <div role="status" className="account checking">
          <span aria-hidden="true" className="avatar skel-circle" />
          <div className="account-text">
            <span aria-hidden="true" className="skel" style={{ width: "40%", height: 11 }} />
            <span className="muted-13">Checking your YouTube account…</span>
          </div>
        </div>
      )}

      {yt === "in" && (phase === "idle" || phase === "failed") && (
        <div className="account">
          <Avatar session={session} />
          <div className="account-text">
            <div className="account-name ellipsis">{session.name}</div>
            {session.handle && <div className="account-handle ellipsis">{session.handle}</div>}
          </div>
          <a href={YOUTUBE} target="_blank" rel="noopener noreferrer" onClick={() => (recheckOnReturn.current = true)} aria-label="Not you? Switch YouTube account" className="not-you">
            Not you?
          </a>
        </div>
      )}

      {yt === "out" && phase === "idle" && (
        <>
          <p className="save-note">Sign in to YouTube in this browser to save.</p>
          <a href={YOUTUBE} target="_blank" rel="noopener noreferrer" onClick={startSignIn} className="btn btn-primary wide">
            Sign in to YouTube ↗
          </a>
        </>
      )}

      {yt === "waiting" && phase === "idle" && (
        <>
          <div role="status" className="waiting-box">
            <span>
              <span aria-hidden="true" className="spinner red" />
              Waiting for you to sign in…
            </span>
            <button type="button" className="btn-link" onClick={() => void check("waiting")}>
              Check again
            </button>
          </div>
          <p className="muted-13 after">We’ll check again when you come back to this tab.</p>
        </>
      )}

      {(phase === "expired" || phase === "failed") && (
        <div role="alert" className="save-alert nf">
          <p>{SAVE_ERRORS[phase]}</p>
          {phase === "expired" ? (
            <a href={YOUTUBE} target="_blank" rel="noopener noreferrer" onClick={startSignIn} className="btn btn-primary small">
              Sign in to YouTube ↗
            </a>
          ) : (
            <button type="button" className="btn btn-primary small" onClick={() => void save()}>
              Try again
            </button>
          )}
        </div>
      )}

      {phase === "partial" && partial && (
        <div role="alert" className="save-alert lo">
          <p>
            Saved {partial.added} of {partial.added + partial.failed} videos. {partial.failed} couldn’t be added.
          </p>
          <div className="save-alert-row">
            <button type="button" className="btn btn-primary small" onClick={() => void save()}>
              Add the rest
            </button>
            <a href={partial.urls.youtube} target="_blank" rel="noopener noreferrer">
              Open the partly saved playlist ↗
            </a>
          </div>
        </div>
      )}

      {phase === "saving" && (
        <div className="saving-box">
          <div role="status" className="saving-row">
            <span>
              Adding {progress.added} of {progress.total} videos…
            </span>
            <span className="mono muted">{pct}</span>
          </div>
          <div role="progressbar" aria-label="Saving to YouTube" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.added} className="thin-track">
            <div className="progress-fill" style={{ width: pct }} />
          </div>
        </div>
      )}

      {yt === "in" && phase === "idle" && (
        <>
          <div role="radiogroup" aria-label="Playlist visibility" className="segmented">
            {PRIVACIES.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={privacy === k} tabIndex={privacy === k ? 0 : -1} onClick={() => setPrivacy(k)} onKeyDown={onPrivacyKey}>
                {k[0]!.toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          <p className="hint">{PRIVACY_HINT[privacy]}</p>
          <button type="button" className="btn btn-primary wide" onClick={() => void save()}>
            Save to YouTube
          </button>
        </>
      )}

      {phase === "saved" && saved && (
        <div role="status" className="saved">
          <p>
            <span className="ok">✓ Saved</span> {saved.video_count} videos as a {privacy} playlist.
          </p>
          <div className="saved-link">
            <span className="ellipsis">{saved.urls.youtube.replace(/^https:\/\/(www\.)?/, "")}</span>
            <button type="button" className="btn btn-primary" onClick={() => copy(saved.urls.youtube, "saved")} aria-label="Copy permanent playlist link">
              {copied === "saved" ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          <div className="saved-open">
            <a href={saved.urls.youtube} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              Open on YouTube ↗
            </a>
            <a href={saved.urls.youtube_music} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              Open in YouTube Music ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

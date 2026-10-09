import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type Counts, type Privacy, type Saved, type SignIn, type TempLinks } from "../api";
import { PRIVACY_HINT, SAVE_ERRORS, useCopy } from "../copy";
import { fmtDuration } from "../state";

const PRIVACIES: Privacy[] = ["private", "unlisted", "public"];
type Modal = null | "code" | "saving" | "expired" | "denied";

interface Props {
  jobId: string;
  playlistName: string;
  links: TempLinks;
  counts: Counts;
  saveEnabled: boolean;
  onSaveDisabled: () => void;
  announce: (msg: string) => void;
}

export function Result({ jobId, playlistName, links, counts: c, saveEnabled, onSaveDisabled, announce }: Props) {
  const { copied, copy } = useCopy(announce);
  const split = links.links.length > 1;
  const sizes = links.links.map((l) => new URL(l.url).searchParams.get("video_ids")?.split(",").length ?? 0);
  const perLink = Math.max(...sizes);
  const matched = c.high + c.medium + c.low;

  return (
    <section aria-labelledby="res-h" className="result">
      <div className="card ready">
        <div aria-hidden="true" className="ready-edge" />
        <p className="eyebrow">
          {playlistName} · {links.video_count} VIDEOS
        </p>
        <h1 id="res-h">Your YouTube playlist is ready</h1>
        {split && (
          <p className="ready-note">
            Quick playlists hold up to {perLink} videos, so yours is split into {links.links.length} parts. Save it to your
            account to keep everything in one playlist.
          </p>
        )}
        <div className="parts">
          {links.links.map((l, i) => {
            const n = sizes[i];
            const key = `part${l.part}`;
            return (
              <div key={l.part} className="part">
                {split && (
                  <span className="part-label">
                    Part {l.part} of {l.of}
                  </span>
                )}
                <span className="part-count">{n} videos</span>
                <div className="part-btns">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    aria-label={split ? `Open part ${l.part} of ${l.of} on YouTube` : "Open on YouTube"}
                  >
                    Open on YouTube ↗
                  </a>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => copy(l.url, key)}
                    aria-label={split ? `Copy link to part ${l.part}` : "Copy playlist link"}
                  >
                    {copied === key ? "Copied ✓" : "Copy link"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="result-grid">
        {saveEnabled && (
          <SaveCard
            jobId={jobId}
            title={playlistName}
            videoCount={links.video_count}
            onSaveDisabled={onSaveDisabled}
            announce={announce}
            copied={copied}
            copy={copy}
          />
        )}
        <div className="card side-card">
          <h2 className="summary-h">Summary</h2>
          <dl className="stats">
            <div className="stat hi">
              <dt>Matched</dt>
              <dd>{matched}</dd>
            </div>
            <div className="stat">
              <dt>Skipped</dt>
              <dd>{c.removed + c.error}</dd>
            </div>
            <div className="stat nf">
              <dt>Not found</dt>
              <dd>{c.not_found}</dd>
            </div>
          </dl>
          <p className="split">
            {c.high} high · {c.medium} medium · {c.low} low
          </p>
          <button type="button" className="csv" onClick={() => (window.location.href = api.reportUrl(jobId))}>
            ↓ Download match report (CSV)
          </button>
        </div>
      </div>
    </section>
  );
}

interface SaveProps {
  jobId: string;
  title: string;
  videoCount: number;
  onSaveDisabled: () => void;
  announce: (msg: string) => void;
  copied: string;
  copy: (text: string, key: string) => void;
}

function SaveCard({ jobId, title, videoCount, onSaveDisabled, announce, copied, copy }: SaveProps) {
  const [privacy, setPrivacy] = useState<Privacy>("unlisted");
  const [modal, setModal] = useState<Modal>(null);
  const [signin, setSignin] = useState<SignIn | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [starting, setStarting] = useState(false);
  const poll = useRef<ReturnType<typeof setTimeout>>();
  const attempt = useRef(0);

  useEffect(() => {
    api.authStatus().then((s) => setSignedIn(s.signed_in)).catch(() => {});
    return () => clearTimeout(poll.current);
  }, []);

  const save = useCallback(async () => {
    setModal("saving");
    try {
      const result = await api.save(jobId, { privacy, title });
      setSaved(result);
      setModal(null);
      announce("Playlist saved to your YouTube account");
    } catch (e) {
      setModal(null);
      const code = e instanceof ApiError ? e.code : "save_failed";
      if (code === "save_disabled") return onSaveDisabled();
      if (code === "not_signed_in") setSignedIn(false);
      setSaveError(code === "not_signed_in" ? "not_signed_in" : "save_failed");
    }
  }, [jobId, privacy, title, announce, onSaveDisabled]);

  const closeModal = useCallback(() => {
    attempt.current++;
    clearTimeout(poll.current);
    setModal(null);
  }, []);

  const openSignIn = useCallback(async () => {
    setSaveError(null);
    if (signedIn) return save();
    clearTimeout(poll.current);
    const run = ++attempt.current;
    setStarting(true);
    try {
      const s = await api.authStart();
      if (run !== attempt.current) return;
      setSignin(s);
      setModal("code");
      const tick = async () => {
        if (run !== attempt.current) return;
        try {
          const { status } = await api.authPoll();
          if (run !== attempt.current) return;
          if (status === "authorized") {
            setSignedIn(true);
            return save();
          }
          if (status === "expired" || status === "denied") return setModal(status);
        } catch {
          // transient network error: keep polling until the code expires
        }
        poll.current = setTimeout(tick, Math.max(2, s.interval) * 1000);
      };
      poll.current = setTimeout(tick, Math.max(2, s.interval) * 1000);
    } catch (e) {
      if (e instanceof ApiError && e.code === "save_disabled") return onSaveDisabled();
      setSaveError("signin_failed");
    } finally {
      setStarting(false);
    }
  }, [signedIn, save, onSaveDisabled]);

  const se = saveError ? SAVE_ERRORS[saveError] : null;
  const onPrivacyKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    let i = PRIVACIES.indexOf(privacy);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") i = (i + 1) % 3;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = (i + 2) % 3;
    else return;
    e.preventDefault();
    setPrivacy(PRIVACIES[i]);
    (e.currentTarget.parentElement?.children[i] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="card side-card">
      <h2>Save to my YouTube account</h2>
      <p className="lead">One playlist with all {videoCount} videos and a permanent link you can share.</p>
      {!saved ? (
        <>
          {se && (
            <div role="alert" className="alert">
              <p>{se.title}</p>
              <p>{se.body}</p>
            </div>
          )}
          <div role="radiogroup" aria-label="Playlist visibility" className="segmented">
            {PRIVACIES.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={privacy === k}
                tabIndex={privacy === k ? 0 : -1}
                onClick={() => setPrivacy(k)}
                onKeyDown={onPrivacyKey}
              >
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          <p className="hint">{PRIVACY_HINT[privacy]}</p>
          <button type="button" className="btn btn-outline-ink wide" onClick={openSignIn} disabled={starting}>
            {se ? se.btn : signedIn ? "Save to YouTube" : "Sign in with Google to save"}
          </button>
        </>
      ) : (
        <div role="status" className="saved">
          <p>
            <span className="ok">✓ Saved</span> {saved.video_count} videos as a {privacy} playlist.
          </p>
          <div className="saved-link">
            <span className="ellipsis">{saved.urls.youtube.replace(/^https:\/\/(www\.)?/, "")}</span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => copy(saved.urls.youtube, "saved")}
              aria-label="Copy permanent playlist link"
            >
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
      {modal && (
        <SignInModal
          modal={modal}
          signin={signin}
          videoCount={videoCount}
          privacy={privacy}
          onClose={closeModal}
          onRetry={openSignIn}
          copied={copied}
          copy={copy}
        />
      )}
    </div>
  );
}

interface ModalProps {
  modal: Exclude<Modal, null>;
  signin: SignIn | null;
  videoCount: number;
  privacy: Privacy;
  onClose: () => void;
  onRetry: () => void;
  copied: string;
  copy: (text: string, key: string) => void;
}

function SignInModal({ modal, signin, videoCount, privacy, onClose, onRetry, copied, copy }: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);
  useEffect(() => {
    if (modal !== "code") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [modal]);
  useEffect(() => {
    // "Saving" can't be cancelled midway; everything else closes on Escape.
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && modal !== "saving" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, onClose]);

  const remaining = signin ? Math.max(0, signin.expires_at * 1000 - now) / 1000 : 0;
  const host = signin?.verification_url.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "";
  const code = signin?.user_code ?? "";

  // Keep keyboard focus inside the dialog.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialog.current) return;
    const items = dialog.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && modal !== "saving" && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-h" tabIndex={-1} ref={dialog} className="dialog" onKeyDown={trapTab}>
        {modal === "code" && signin && (
          <>
            <h2 id="dlg-h">Sign in with Google</h2>
            <p className="intro">
              Go to{" "}
              <a href={signin.verification_url} target="_blank" rel="noopener noreferrer">
                {host}
              </a>{" "}
              and enter
            </p>
            <div className="code-box">
              <span aria-label={`Code ${code.split("").map((ch) => (ch === "-" ? "dash" : ch)).join(" ")}`} className="code">
                {code}
              </span>
              <button type="button" onClick={() => copy(code, "code")}>
                {copied === "code" ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <p role="status" className="waiting">
              <span aria-hidden="true" className="spinner" />
              Waiting for you to approve on your device…
            </p>
            <p className="expires">Code expires in {fmtDuration(remaining)}</p>
          </>
        )}
        {modal === "saving" && (
          <>
            <h2 id="dlg-h">Saving your playlist</h2>
            <p role="status" className="saving">
              <span aria-hidden="true" className="spinner red" />
              Adding {videoCount} videos as {privacy}…
            </p>
          </>
        )}
        {modal === "expired" && (
          <>
            <h2 id="dlg-h">The code expired</h2>
            <p role="alert" className="body">
              It wasn't entered in time. Get a new code to keep going.
            </p>
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Get a new code
            </button>
          </>
        )}
        {modal === "denied" && (
          <>
            <h2 id="dlg-h">Access wasn't granted</h2>
            <p role="alert" className="body">
              Google says access was denied. To save the playlist, try again and choose Allow.
            </p>
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Try again
            </button>
          </>
        )}
        {modal !== "saving" && (
          <button type="button" className="cancel" onClick={onClose}>
            {modal === "expired" || modal === "denied" ? "Close" : "Cancel"}
          </button>
        )}
      </div>
    </div>
  );
}

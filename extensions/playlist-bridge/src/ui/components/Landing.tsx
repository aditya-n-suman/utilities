import { useState, type DragEvent, type FormEvent } from "react";
import type { ResumeSnapshot } from "../api";
import { EMPTY_LINK, EXAMPLE_LINK, INVALID_LINK } from "../copy";
import { looksLikePlaylistLink } from "../state";

/** Set when the app was opened from Spotify (right-click menu or the button on a playlist page). */
export interface FromSpotify {
  link: string;
  name?: string;
}

interface Props {
  url: string;
  onUrl: (url: string) => void;
  urlError: string;
  onUrlError: (msg: string) => void;
  showPaste: boolean;
  onTogglePaste: () => void;
  busy: boolean;
  onConvertUrl: (url: string) => void;
  onConvertList: (text: string, name: string) => void;
  fromSpotify: FromSpotify | null;
  onClearFrom: () => void;
  resume: ResumeSnapshot | null;
  onResume: () => void;
  onDiscard: () => void;
}

function ResumeBanner({ resume, onResume, onDiscard }: { resume: ResumeSnapshot; onResume: () => void; onDiscard: () => void }) {
  const meta = resume.stage === "result" ? `${resume.matched} videos ready` : `${resume.matched} / ${resume.total} matched`;
  const sub =
    resume.stage === "result"
      ? "Finished, but not saved to your YouTube account yet."
      : resume.stage === "review"
        ? "Matches are waiting for your review."
        : "Matching stopped when you left.";
  return (
    <div role="region" aria-label="Unfinished conversion" className="resume">
      <div className="resume-main">
        <span aria-hidden="true" className="resume-art" />
        <div style={{ minWidth: 0 }}>
          <p>
            Pick up where you left off? <strong>{resume.playlist_name}</strong> ·{" "}
            <span className="mono" style={{ fontSize: 14 }}>{meta}</span>
          </p>
          <p className="resume-sub">{sub}</p>
        </div>
      </div>
      <div className="resume-btns">
        <button type="button" className="btn btn-primary" onClick={onResume}>
          Resume
        </button>
        <button type="button" className="ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

export function Landing(props: Props) {
  const { url, urlError, showPaste, busy } = props;
  const [pasteText, setPasteText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteError, setPasteError] = useState("");

  const submitUrl = (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!u) return props.onUrlError(EMPTY_LINK);
    if (!looksLikePlaylistLink(u)) return props.onUrlError(INVALID_LINK);
    props.onConvertUrl(u);
  };

  const submitList = async (e: FormEvent) => {
    e.preventDefault();
    if (file) {
      const text = await file.text();
      if (!text.trim()) return setPasteError("That file is empty.");
      return props.onConvertList(text, file.name.replace(/\.csv$/i, ""));
    }
    if (!pasteText.trim()) return setPasteError("Paste at least one track, or choose a CSV file.");
    props.onConvertList(pasteText, "Pasted list");
  };

  const pick = (f: File | undefined | null) => {
    setFile(f ?? null);
    setPasteError("");
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  return (
    <>
    {props.resume && <ResumeBanner resume={props.resume} onResume={props.onResume} onDiscard={props.onDiscard} />}
    <section aria-labelledby="hero-h" className="landing">
      <p className="kicker">
        <span aria-hidden="true" className="kicker-line" />
        SPOTIFY → YOUTUBE
      </p>
      <h1 id="hero-h" className="hero">
        Spotify playlist in, YouTube playlist out.
      </h1>
      <p className="lede">
        Paste a link. We find every song on YouTube, you check the matches, and you get a playlist to open or save.
      </p>

      <form onSubmit={submitUrl} noValidate className="url-form">
        <label htmlFor="pl-url" className="field-label">
          Paste a Spotify playlist link
        </label>
        {props.fromSpotify && (
          <span className="from-chip">
            <span aria-hidden="true" className="dot" />
            <span className="text">
              <span className="from">From Spotify ·</span>{" "}
              {props.fromSpotify.name ? (
                <strong style={{ fontWeight: 600 }}>{props.fromSpotify.name}</strong>
              ) : (
                <span className="mono" style={{ fontSize: 12 }}>{props.fromSpotify.link.replace(/^https?:\/\//, "")}</span>
              )}
            </span>
            <button
              type="button"
              onClick={props.onClearFrom}
              aria-label={props.fromSpotify.name ? "Clear the playlist opened from Spotify" : "Clear the link opened from Spotify"}
            >
              ×
            </button>
          </span>
        )}
        <div className={`url-box${urlError ? " invalid" : ""}`}>
          <input
            id="pl-url"
            className="url-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="open.spotify.com/playlist/…"
            value={url}
            onChange={(e) => props.onUrl(e.target.value)}
            aria-invalid={!!urlError}
            aria-describedby="pl-url-help"
          />
          <button type="submit" className="btn btn-primary url-submit" disabled={busy}>
            Convert
          </button>
        </div>
        <div id="pl-url-help" className="url-help">
          {urlError ? (
            <p role="alert" className="url-error">
              <span aria-hidden="true">●</span>
              <span>{urlError}</span>
            </p>
          ) : (
            <p className="url-note">
              <span>Public playlists only.</span>
              <button type="button" className="btn-link" onClick={() => props.onUrl(EXAMPLE_LINK)}>
                Try an example link
              </button>
            </p>
          )}
        </div>
      </form>

      <div className="paste">
        <button
          type="button"
          className="paste-toggle"
          onClick={props.onTogglePaste}
          aria-expanded={showPaste}
          aria-controls="paste-panel"
        >
          <span>or paste a track list / upload CSV</span>
          <span aria-hidden="true" style={{ fontSize: 12 }}>
            {showPaste ? "▲" : "▼"}
          </span>
        </button>
        {showPaste && (
          <form id="paste-panel" className="paste-panel" onSubmit={submitList}>
            <div className="paste-col">
              <label htmlFor="paste-ta" className="paste-label">
                Track list
              </label>
              <textarea
                id="paste-ta"
                className="paste-ta"
                rows={7}
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  setPasteError("");
                }}
                placeholder={"Artist – Title, one per line\nMara Vey – Paper Rivers\nLowtide Club – Neon Motel"}
              />
            </div>
            <div className="paste-col">
              <span id="drop-l" className="paste-label">
                CSV file
              </span>
              <label
                className={`drop${dragging ? " dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input
                  type="file"
                  accept=".csv,text/csv"
                  aria-labelledby="drop-l"
                  onChange={(e) => pick(e.target.files?.[0])}
                />
                <span className="drop-title">{file?.name || (dragging ? "Drop to upload" : "Drop a CSV here")}</span>
                <span>{file ? "Ready to convert" : "or click to choose a file"}</span>
              </label>
            </div>
            <div className="paste-actions">
              {pasteError && (
                <p role="alert" className="paste-error">
                  {pasteError}
                </p>
              )}
              <button type="submit" className="btn btn-outline-ink" style={{ height: 44, padding: "0 20px" }} disabled={busy}>
                Convert list
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
    </>
  );
}

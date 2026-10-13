import { memo, useState, type FormEvent, type RefObject } from "react";
import type { Candidate, Match } from "../api";
import { QUAL, sourceLabel } from "../copy";
import { confidenceFor, durationDiff, fmtDuration } from "../state";

export interface PanelState {
  index: number;
  mode: "swap" | "search";
  query: string;
  results: Candidate[] | null;
  searching: boolean;
  error: string;
  previewId: string | null;
}

export interface RowHandlers {
  togglePanel: (match: Match, mode: "swap" | "search") => void;
  setQuery: (q: string) => void;
  search: (index: number, q: string) => void;
  preview: (videoId: string | null) => void;
  use: (index: number, candidate: Candidate) => void;
  remove: (match: Match) => void;
  undo: (match: Match) => void;
  retry: (match: Match) => void;
}

interface Props {
  match: Match;
  isReview: boolean;
  panel: PanelState | null;
  handlers: RowHandlers;
  searchRef: RefObject<HTMLInputElement>;
}

function Img({ src, className, eager }: { src: string; className: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span aria-hidden="true" className={className} />;
  return (
    <img className={className} src={src} alt="" loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
  );
}

function TrackRowImpl({ match: m, isReview, panel, handlers: h, searchRef }: Props) {
  const t = m.track;
  const ch = m.chosen;
  const label = `${t.title} by ${t.artists.join(", ")}`;
  const trackS = t.duration_ms ? Math.round(t.duration_ms / 1000) : null;
  const pool = [ch, ...m.alternatives].filter((c): c is Candidate => !!c);
  const showActions = isReview && (m.status === "matched" || m.status === "not_found" || m.status === "error");
  const swapOpen = panel?.mode === "swap";
  const searchOpen = panel?.mode === "search";
  const diff = ch ? durationDiff(t.duration_ms, ch.duration_s) : null;

  const list = searchOpen ? panel?.results ?? [] : pool;
  const previewing = panel?.previewId ? list.find((c) => c.video_id === panel.previewId) : undefined;
  const hint = searchOpen
    ? panel?.searching
      ? "Searching…"
      : panel?.error || (panel?.results ? `${list.length} results` : "Edit the search and press Enter.")
    : `${list.length} candidates, best first`;

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    if (panel?.query.trim()) h.search(m.index, panel.query.trim());
  };

  return (
    <div role="listitem" className={`row${m.status === "removed" ? " removed" : ""}`}>
      <div className="row-grid">
        <div className="side">
          <span className="num">{m.index + 1}</span>
          {t.cover_url && <Img className="art" src={t.cover_url} />}
          <div className="grow">
            <div className="title-line">
              <span className="track-title ellipsis">{t.title}</span>
              {t.explicit && (
                <span aria-label="Explicit" title="Explicit" className="explicit">
                  E
                </span>
              )}
            </div>
            <div className="subtitle ellipsis">
              {t.artists.join(", ") || "Unknown artist"}
              {t.album ? ` · ${t.album}` : ""}
            </div>
          </div>
          {trackS != null && <span className="dur">{fmtDuration(trackS)}</span>}
        </div>

        <div style={{ minWidth: 0 }}>
          {m.status === "pending" && (
            <div aria-label="Searching YouTube" className="side pending">
              <span className="thumb" />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                <span className="skel" style={{ width: "75%", height: 11 }} />
                <span className="skel" style={{ width: "40%", height: 10 }} />
              </div>
            </div>
          )}
          {m.status === "matched" && ch && (
            <div className="side">
              <Img className="thumb" src={ch.thumbnail} />
              <div className="grow">
                <div className="yt-title ellipsis">{ch.title}</div>
                <div className="yt-sub ellipsis">
                  {ch.channel || "Unknown channel"} <span className="src">· {sourceLabel(ch.source)}</span>
                </div>
              </div>
              <div className="chip-col">
                <span className={`chip ${m.confidence ?? "low"}`}>{QUAL[m.confidence ?? "low"]}</span>
                {diff != null && (
                  <span aria-label={`Duration differs by ${diff} seconds`} className="diff">
                    ±{diff}s
                  </span>
                )}
              </div>
            </div>
          )}
          {m.status === "not_found" && (
            <div className="side">
              <span aria-hidden="true" className="thumb dashed" />
              <div className="muted-msg">No confident match on YouTube</div>
              <span className="chip none">Not found</span>
            </div>
          )}
          {m.status === "error" && (
            <div className="side">
              <span aria-hidden="true" className="thumb bang">
                !
              </span>
              <div className="muted-msg">Search didn't finish</div>
              <button type="button" className="retry-small" onClick={() => h.retry(m)} aria-label={`Retry search for ${label}`}>
                Retry
              </button>
            </div>
          )}
          {m.status === "removed" && (
            <div className="removed-msg">
              <span>Removed from playlist</span>
              <button type="button" className="btn-link" onClick={() => h.undo(m)} aria-label={`Undo removing ${label}`}>
                Undo
              </button>
            </div>
          )}
        </div>
      </div>

      {showActions && (
        <div className="actions">
          {m.picked && <span className="picked">✓ Picked by you</span>}
          {pool.length > 0 && (
            <button
              type="button"
              className="btn-small"
              onClick={() => h.togglePanel(m, "swap")}
              aria-expanded={swapOpen}
              aria-label={`Swap match for ${label}`}
            >
              Swap match ▾
            </button>
          )}
          <button
            type="button"
            className="btn-small"
            onClick={() => h.togglePanel(m, "search")}
            aria-expanded={searchOpen}
            aria-label={`Search YouTube by hand for ${label}`}
          >
            Search
          </button>
          <button type="button" className="btn-small btn-remove" onClick={() => h.remove(m)} aria-label={`Remove ${label}`}>
            Remove
          </button>
        </div>
      )}

      {panel && (
        <div role="region" aria-label={`Candidates for ${label}`} className="panel">
          {searchOpen && (
            <form className="search-form" onSubmit={submitSearch}>
              <label htmlFor={`search-${m.index}`} className="sr-only">
                Search YouTube
              </label>
              <input
                id={`search-${m.index}`}
                ref={searchRef}
                className="search-input"
                type="search"
                value={panel.query}
                onChange={(e) => h.setQuery(e.target.value)}
                placeholder="Search YouTube"
              />
              <button type="submit" className="btn btn-primary" disabled={panel.searching}>
                Search
              </button>
            </form>
          )}
          {previewing && (
            <div className="preview">
              <div className="player">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${previewing.video_id}?autoplay=1&rel=0`}
                  title={`Preview of ${previewing.title}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="preview-meta">
                <span className="eyebrow">PREVIEW</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{previewing.title}</span>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{previewing.channel}</span>
                <button type="button" className="btn-link" onClick={() => h.preview(null)}>
                  Close preview
                </button>
              </div>
            </div>
          )}
          <p className="panel-hint" role={searchOpen ? "status" : undefined}>
            {hint}
          </p>
          {list.map((alt) => {
            const current = !!ch && m.status === "matched" && ch.video_id === alt.video_id;
            const conf = confidenceFor(alt.score);
            const chip = conf === "none" ? "low" : conf;
            const d = durationDiff(t.duration_ms, alt.duration_s);
            const isPreview = panel.previewId === alt.video_id;
            return (
              <div key={alt.video_id} className={`alt${isPreview ? " previewing" : ""}`}>
                <Img className="alt-thumb" src={alt.thumbnail} eager />
                <div className="alt-body">
                  <div className="alt-title ellipsis">{alt.title}</div>
                  <div className="alt-sub">
                    {alt.channel || "Unknown channel"} · {sourceLabel(alt.source)}
                    {d != null && (
                      <>
                        {" · "}
                        <span className="mono">±{d}s</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={`chip ${chip}`}>{QUAL[chip]}</span>
                <div className="alt-btns">
                  <button
                    type="button"
                    className="alt-preview"
                    onClick={() => h.preview(isPreview ? null : alt.video_id)}
                    aria-label={`Preview ${alt.title}`}
                    aria-pressed={isPreview}
                  >
                    ▶ Preview
                  </button>
                  <button
                    type="button"
                    className="alt-use"
                    onClick={() => h.use(m.index, alt)}
                    aria-label={`Use ${alt.title} for ${t.title}`}
                    disabled={current}
                  >
                    {current ? "Current" : "Use this"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const TrackRow = memo(TrackRowImpl);

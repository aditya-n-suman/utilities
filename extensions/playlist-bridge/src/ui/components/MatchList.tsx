import type { RefObject } from "react";
import type { Counts, Match } from "../api";
import { matchesFilter, needsReview, type Filter } from "../state";
import { TrackRow, type PanelState, type RowHandlers } from "./TrackRow";

interface Props {
  isReview: boolean;
  settled: boolean;
  matches: Match[];
  counts: Counts;
  filter: Filter;
  onFilter: (f: Filter) => void;
  panel: PanelState | null;
  handlers: RowHandlers;
  searchRef: RefObject<HTMLInputElement>;
  onRetryErrors: () => void;
  onReview: () => void;
  onCreate: () => void;
  creating: boolean;
  createError: string;
}

export function MatchList(p: Props) {
  const { counts: c, isReview } = p;
  const matched = c.high + c.medium + c.low;
  const reviewCount = p.matches.filter(needsReview).length;
  const visible = isReview ? p.matches.filter((m) => matchesFilter(m, p.filter)) : p.matches;
  const slowed = !p.settled && c.error > 0;
  const partial = p.settled && c.error > 0;

  const tabs: [Filter, string, number][] = [
    ["all", "All", c.total - c.removed],
    ["review", "Needs review", reviewCount],
    ["notfound", "Not found", c.not_found],
  ];

  return (
    <section aria-label={isReview ? "Review matches" : "Live matching results"} className="list-section">
      {slowed && (
        <div role="alert" className="banner warn">
          <div className="banner-body">
            <p className="banner-title">YouTube search slowed down</p>
            <p className="banner-text">
              {c.error} {c.error === 1 ? "search" : "searches"} didn't finish at {matched} / {c.total} matched. The matches
              so far are kept.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={p.onRetryErrors}>
            Retry
          </button>
        </div>
      )}

      {partial && (
        <div role="status" className="banner partial">
          <div className="banner-body">
            <p className="banner-title">Partial results</p>
            <p className="banner-text">
              {c.error} of {c.total} tracks couldn’t be searched because YouTube stopped responding. Retry them, or create
              the playlist with what’s here.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={p.onRetryErrors}>
            Retry failed tracks
          </button>
        </div>
      )}

      {!isReview && p.settled && (
        <div className="banner done">
          <p style={{ margin: 0, fontSize: 15 }}>
            <strong>All {c.total} tracks searched.</strong>{" "}
            <span style={{ color: "var(--ink-2)" }}>
              {matched} found, {reviewCount} worth a look, {c.not_found} not found.
            </span>
          </p>
          <button type="button" className="btn btn-primary" onClick={p.onReview}>
            Review matches →
          </button>
        </div>
      )}

      {isReview && (
        <div role="tablist" aria-label="Filter tracks" className="tabs">
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={p.filter === key}
              aria-controls="track-list"
              onClick={() => p.onFilter(key)}
            >
              <span>{label}</span>
              <span className="tab-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card track-card">
        <div aria-hidden="true" className="cols">
          <span className="col-head">
            <span className="col-dot" style={{ background: "var(--green)" }} />
            SPOTIFY
          </span>
          <span className="col-head">
            <span className="col-dot" style={{ background: "var(--red)" }} />
            YOUTUBE
          </span>
        </div>

        {isReview && visible.length === 0 && (
          <div className="list-empty">
            <p>{p.filter === "review" ? "Nothing needs review" : "Every track was found"}</p>
            <p>Switch to All to see the full list.</p>
          </div>
        )}

        <div id="track-list" role="list" aria-label="Tracks">
          {visible.map((m) => (
            <TrackRow
              key={m.index}
              match={m}
              isReview={isReview}
              panel={p.panel?.index === m.index ? p.panel : null}
              handlers={p.handlers}
              searchRef={p.searchRef}
            />
          ))}
        </div>
      </div>

      {isReview && (
        <div className="footer">
          <p>
            <strong>{matched}</strong> videos will be added · {reviewCount} need review · {c.not_found} not found
            {p.createError && (
              <span role="alert" style={{ color: "var(--nf-fg)" }}>
                {" "}
                · {p.createError}
              </span>
            )}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={p.onCreate}
            disabled={matched === 0 || p.creating}
          >
            {p.creating ? "Creating…" : "Create playlist"}
          </button>
        </div>
      )}
    </section>
  );
}

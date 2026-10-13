import { useState } from "react";
import type { Counts, PlaylistInfo } from "../api";

interface Props {
  playlist: PlaylistInfo | null;
  progress?: { label: string; matched: number; counts: Counts } | null;
}

export function PlaylistCard({ playlist, progress }: Props) {
  const [coverFailed, setCoverFailed] = useState(false);
  const capped = !!playlist?.track_count && playlist.total > playlist.track_count;
  const trackCount = playlist?.track_count;

  return (
    <section aria-label="Playlist" className="card playlist-card">
      <div className="playlist-row">
        {playlist?.cover_url && !coverFailed ? (
          <img className="cover" src={playlist.cover_url} alt="" onError={() => setCoverFailed(true)} />
        ) : (
          <div aria-hidden="true" className="cover" />
        )}
        <div className="playlist-meta">
          <p className="eyebrow">{playlist?.source === "paste" ? "TRACK LIST" : "SPOTIFY PLAYLIST"}</p>
          {playlist ? (
            <>
              <h1 className="playlist-name">{playlist.name}</h1>
              <p className="playlist-sub">
                {playlist.owner ? `by ${playlist.owner} · ` : ""}
                {trackCount != null ? `${trackCount} tracks` : "counting tracks…"}
              </p>
            </>
          ) : (
            <>
              <h1 className="playlist-name">
                <span className="sr-only">Loading playlist</span>
                <span aria-hidden="true" className="skel-text" style={{ width: 220, height: 26 }} />
              </h1>
              <span aria-hidden="true" className="skel-text" style={{ width: 140 }} />
            </>
          )}
        </div>
        {progress && (
          <div className="progress">
            <div className="progress-top">
              <span className="progress-label">{progress.label}</span>
              <span className="progress-count">
                {progress.matched} / {progress.counts.total} matched
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Matching progress"
              aria-valuemin={0}
              aria-valuemax={progress.counts.total}
              aria-valuenow={progress.counts.done}
              className="progress-track"
            >
              <div
                className="progress-fill"
                style={{ width: `${progress.counts.total ? (progress.counts.done / progress.counts.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
      {capped && (
        <p role="note" className="note">
          This playlist has <strong>{playlist!.total}</strong> tracks. We'll convert the first{" "}
          <strong>{playlist!.track_count}</strong>.
        </p>
      )}
    </section>
  );
}

const SKELETONS: [string, string][] = [
  ["62%", "38%"], ["48%", "30%"], ["70%", "42%"], ["55%", "26%"],
  ["64%", "36%"], ["44%", "32%"], ["58%", "40%"], ["50%", "28%"],
];

export function Fetching({ loadingMore }: { loadingMore: boolean }) {
  return (
    <section aria-busy="true" aria-label="Loading tracks" className="fetching">
      <div className="fetch-note">
        <span aria-hidden="true" className="spinner" />
        <span>{loadingMore ? "Loading full playlist…" : "Fetching tracks from Spotify…"}</span>
      </div>
      <div className="card skel-list">
        {SKELETONS.map(([w1, w2], i) => (
          <div key={i} aria-hidden="true" className="skel-row">
            <span className="skel" style={{ width: 20, height: 10 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              <span className="skel" style={{ width: w1, height: 12 }} />
              <span className="skel" style={{ width: w2, height: 10 }} />
            </div>
            <span className="skel" style={{ width: 34, height: 10 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

import type { Confidence, Counts, Match, PlaylistInfo } from "./api";

export type Screen = "landing" | "fetching" | "matching" | "review" | "result" | "error";
export type Filter = "all" | "review" | "notfound";

export interface JobState {
  screen: Screen;
  jobId: string | null;
  playlist: PlaylistInfo | null;
  loadingMore: boolean;
  matches: Match[];
  counts: Counts;
  /** the initial matching pass has finished (retries may still be running) */
  finished: boolean;
  errorCode: string | null;
}

export const emptyCounts: Counts = { total: 0, done: 0, high: 0, medium: 0, low: 0, not_found: 0, removed: 0, error: 0 };

export const initialJob: JobState = {
  screen: "landing",
  jobId: null,
  playlist: null,
  loadingMore: false,
  matches: [],
  counts: emptyCounts,
  finished: false,
  errorCode: null,
};

export type JobAction =
  | { type: "reset" }
  | { type: "started"; jobId: string }
  | { type: "fetching"; playlist: PlaylistInfo; loadingMore: boolean }
  | { type: "playlist"; playlist: PlaylistInfo; matches: Match[] }
  | { type: "match"; match: Match; counts: Counts }
  | { type: "done"; counts: Counts }
  | { type: "failed"; code: string }
  | { type: "screen"; screen: Screen };

export function jobReducer(state: JobState, action: JobAction): JobState {
  switch (action.type) {
    case "reset":
      return initialJob;
    case "started":
      return { ...initialJob, screen: "fetching", jobId: action.jobId };
    case "fetching":
      return { ...state, playlist: action.playlist, loadingMore: action.loadingMore };
    case "playlist":
      return {
        ...state,
        screen: state.screen === "fetching" ? "matching" : state.screen,
        playlist: action.playlist,
        loadingMore: false,
        matches: action.matches,
        counts: { ...emptyCounts, total: action.matches.length },
      };
    case "match": {
      const i = action.match.index;
      if (i < 0 || i >= state.matches.length) return state;
      const matches = state.matches.slice();
      matches[i] = action.match;
      return { ...state, matches, counts: action.counts };
    }
    case "done":
      return { ...state, counts: action.counts, finished: true };
    case "failed":
      return { ...state, screen: "error", errorCode: action.code };
    case "screen":
      return { ...state, screen: action.screen };
  }
}

/** All searches settled: the first pass finished and no retry is in flight. */
export const isSettled = (s: JobState) => s.finished && s.counts.total > 0 && s.counts.done === s.counts.total;

/** A row the user should look at: failed search, or a match we're not confident about. */
export const needsReview = (m: Match) =>
  m.status === "error" || (m.status === "matched" && m.confidence !== "high" && !m.picked);

export function matchesFilter(m: Match, filter: Filter): boolean {
  if (filter === "review") return needsReview(m);
  if (filter === "notfound") return m.status === "not_found";
  return true;
}

// Mirrors backend matcher thresholds (app/youtube/matcher.py).
export function confidenceFor(score: number): Confidence {
  return score >= 0.78 ? "high" : score >= 0.6 ? "medium" : score >= 0.42 ? "low" : "none";
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function durationDiff(trackMs: number | null | undefined, videoS: number | null | undefined): number | null {
  if (!trackMs || !videoS) return null;
  return Math.abs(Math.round(trackMs / 1000) - videoS);
}

const PLAYLIST_RE =
  /^(?:https?:\/\/)?(?:(?:open|play)\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?playlist\/[A-Za-z0-9]{22}|spotify\.link\/\S+|spoti\.fi\/\S+)|^spotify:playlist:[A-Za-z0-9]{22}$/i;

export const looksLikePlaylistLink = (url: string) => PLAYLIST_RE.test(url.trim());

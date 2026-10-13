// Data shapes shared by the engine and the UI. They mirror the web app's API contract
// (apps/spotify-to-youtube/DESIGN_BRIEF.md) so the copied UI works unchanged.

export type Confidence = "high" | "medium" | "low" | "none";
export type MatchStatus = "pending" | "matched" | "not_found" | "removed" | "error";
export type Privacy = "private" | "unlisted" | "public";

export interface Track {
  title: string;
  artists: string[];
  album?: string | null;
  duration_ms?: number | null;
  explicit: boolean;
  spotify_uri?: string | null;
  cover_url?: string | null;
}

export interface Candidate {
  video_id: string;
  title: string;
  channel?: string | null;
  duration_s?: number | null;
  source: string;
  score: number;
  thumbnail: string;
  url: string;
}

export interface Match {
  index: number;
  track: Track;
  status: MatchStatus;
  confidence: Confidence | null;
  chosen: Candidate | null;
  alternatives: Candidate[];
  error: string | null;
  picked: boolean;
}

export interface Counts {
  total: number;
  done: number;
  high: number;
  medium: number;
  low: number;
  not_found: number;
  removed: number;
  error: number;
}

export interface PlaylistInfo {
  id?: string | null;
  name: string;
  owner?: string | null;
  cover_url?: string | null;
  total: number;
  /** null while the full track list is still loading */
  track_count: number | null;
  source: string;
}

export interface TempLinks {
  links: { part: number; of: number; url: string }[];
  video_count: number;
}

export interface Saved {
  playlist_id: string;
  urls: { youtube: string; youtube_music: string };
  video_count: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}


/** The YouTube account signed in to this browser (used for "Save to my YouTube account"). */
export interface Session {
  signed_in: boolean;
  name?: string;
  handle?: string;
  avatar_url?: string;
}

export interface SaveProgress {
  added: number;
  total: number;
}

/** Some batches were added before YouTube refused the rest. */
export interface PartialSave extends Saved {
  added: number;
  failed: number;
}

/** What the landing page offers to resume. */
export interface ResumeSnapshot {
  job_id: string;
  playlist_name: string;
  matched: number;
  total: number;
  stage: "matching" | "review" | "result";
}

/** Events a job emits, in order: fetching? → playlist → match* → done, or failed at any point. */
export type JobEvent =
  | { type: "fetching"; data: { playlist: PlaylistInfo; loading_more: boolean; recovering?: boolean } }
  | { type: "playlist"; data: { playlist: PlaylistInfo; matches: Match[] } }
  | { type: "match"; data: { match: Match; counts: Counts } }
  | { type: "done"; data: { counts: Counts } }
  | { type: "failed"; data: { code: string; message: string } };

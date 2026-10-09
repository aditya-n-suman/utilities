// Types and calls for the FastAPI backend (see ../DESIGN_BRIEF.md for the data contract).

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

export interface SignIn {
  user_code: string;
  verification_url: string;
  interval: number;
  /** epoch seconds */
  expires_at: number;
}

export type PollStatus = "pending" | "authorized" | "expired" | "denied";

export interface Saved {
  playlist_id: string;
  urls: { youtube: string; youtube_music: string };
  video_count: number;
}

export interface Health {
  ok: boolean;
  save_enabled: boolean;
  max_tracks: number;
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

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const resp = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const detail = data?.detail;
    const code = typeof detail === "object" && detail?.code ? detail.code : `http_${resp.status}`;
    const message =
      typeof detail === "string" ? detail : detail?.message ?? (Array.isArray(detail) ? detail[0]?.msg : resp.statusText);
    throw new ApiError(resp.status, code, message || "Request failed");
  }
  return data as T;
}

const job = (id: string) => `/api/jobs/${encodeURIComponent(id)}`;

export const api = {
  health: () => request<Health>("/api/health"),
  convert: (body: { url: string } | { text: string; name?: string }) =>
    request<{ job_id: string }>("/api/convert", { method: "POST", json: body }),
  events: (jobId: string) => new EventSource(`${job(jobId)}/events`),
  edit: (jobId: string, index: number, body: { action: "choose" | "remove" | "restore" | "retry"; candidate?: Candidate }) =>
    request<{ match: Match; counts: Counts }>(`${job(jobId)}/matches/${index}`, { method: "PATCH", json: body }),
  search: (jobId: string, index: number, q: string) =>
    request<{ results: Candidate[] }>(`${job(jobId)}/matches/${index}/search?q=${encodeURIComponent(q)}`),
  retryErrors: (jobId: string) => request<{ queued: number; counts: Counts }>(`${job(jobId)}/retry-errors`, { method: "POST" }),
  links: (jobId: string) => request<TempLinks>(`${job(jobId)}/links`, { method: "POST" }),
  reportUrl: (jobId: string) => `${job(jobId)}/report.csv`,
  authStatus: () => request<{ enabled: boolean; signed_in: boolean }>("/api/auth/youtube"),
  authStart: () => request<SignIn>("/api/auth/youtube/start", { method: "POST" }),
  authPoll: () => request<{ status: PollStatus }>("/api/auth/youtube/poll", { method: "POST" }),
  save: (jobId: string, body: { privacy: Privacy; title?: string }) =>
    request<Saved>(`${job(jobId)}/save`, { method: "POST", json: body }),
};

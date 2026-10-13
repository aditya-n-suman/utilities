// The in-browser engine: everything the FastAPI backend did, running inside the extension page.
// Phase 1 ships the interface only; later phases fill it in.
import {
  ApiError,
  type Candidate,
  type Counts,
  type JobEvent,
  type Match,
  type PartialSave,
  type Privacy,
  type ResumeSnapshot,
  type SaveProgress,
  type Saved,
  type Session,
  type TempLinks,
} from "./types";

export type ConvertInput = { url: string } | { text: string; name?: string };
export type EditAction = "choose" | "remove" | "restore" | "retry";

export interface Engine {
  convert(input: ConvertInput): Promise<{ job_id: string }>;
  /** Replays past events, then streams new ones. Returns an unsubscribe function. */
  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void;
  edit(jobId: string, index: number, action: EditAction, candidate?: Candidate): Promise<{ match: Match; counts: Counts }>;
  search(jobId: string, index: number, query: string): Promise<{ results: Candidate[] }>;
  retryErrors(jobId: string): Promise<{ queued: number; counts: Counts }>;
  links(jobId: string): Promise<TempLinks>;
  reportCsv(jobId: string): Promise<{ filename: string; csv: string }>;
  session(): Promise<Session>;
  save(
    jobId: string,
    options: { privacy: Privacy; title?: string },
    onProgress: (progress: SaveProgress) => void,
  ): Promise<Saved | PartialSave>;
  resumable(): Promise<ResumeSnapshot | null>;
  discard(jobId: string): Promise<void>;
  clearCache(): Promise<void>;
}

const notReady = (): never => {
  throw new ApiError(501, "engine_not_ready", "This part of Playlist Bridge isn't built yet.");
};

export const engine: Engine = {
  convert: async () => notReady(),
  subscribe: () => () => {},
  edit: async () => notReady(),
  search: async () => notReady(),
  retryErrors: async () => notReady(),
  links: async () => notReady(),
  reportCsv: async () => notReady(),
  session: async () => ({ signed_in: false }),
  save: async () => notReady(),
  resumable: async () => null,
  discard: async () => {},
  clearCache: async () => {},
};

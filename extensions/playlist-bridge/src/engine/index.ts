// The in-browser engine: everything the web app's FastAPI backend did, running inside the extension page.
import { IdbMatchCache } from "./cache";
import { EngineError, InvalidPlaylistLink } from "./errors";
import { JobManager, type Stage } from "./jobs";
import { reportCsv, tempLinks } from "./report";
import { parsePlaylistId } from "./sources";
import { IdbJobStore } from "./store";
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
import { savePlaylist } from "./youtube/save";
import { Searcher } from "./youtube/search";
import { getSession } from "./youtube/session";

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
  setStage(jobId: string, stage: Stage): void;
  session(): Promise<Session>;
  save(
    jobId: string,
    options: { privacy: Privacy; title?: string },
    onProgress: (progress: SaveProgress) => void,
  ): Promise<Saved | PartialSave>;
  resumable(): Promise<ResumeSnapshot | null>;
  resume(jobId: string): Promise<{ job_id: string; stage: Stage }>;
  discard(jobId: string): Promise<void>;
  clearCache(): Promise<void>;
}

/** Engine errors surface to the UI as ApiError, like the web app's HTTP errors did. */
const asApiError = (e: unknown): never => {
  if (e instanceof ApiError) throw e;
  if (e instanceof EngineError) throw new ApiError(400, e.code, e.message);
  throw new ApiError(500, "internal", e instanceof Error ? e.message : String(e));
};
const wrap = <A extends unknown[], R>(fn: (...args: A) => Promise<R> | R) => async (...args: A): Promise<R> => {
  try {
    return await fn(...args);
  } catch (e) {
    return asApiError(e);
  }
};

export function createEngine(): Engine {
  const cache = new IdbMatchCache();
  const store = new IdbJobStore();
  const jobs = new JobManager(new Searcher(cache), store);

  return {
    convert: wrap(async (input: ConvertInput) => {
      if ("url" in input) {
        parsePlaylistId(input.url); // throws InvalidPlaylistLink early (null = short link, resolved later)
        const job = jobs.create({ link: input.url });
        return { job_id: job.id };
      }
      if (!input.text.trim()) throw new InvalidPlaylistLink("Paste at least one track.");
      return { job_id: jobs.create({ text: input.text, name: input.name }).id };
    }),
    subscribe: (jobId, listener) => {
      try {
        return jobs.get(jobId).subscribe(listener);
      } catch {
        listener({ type: "failed", data: { code: "job_lost", message: "This conversion is no longer available." } });
        return () => {};
      }
    },
    edit: wrap(async (jobId: string, index: number, action: EditAction, candidate?: Candidate) => {
      const job = jobs.get(jobId);
      if (!job.matches[index]) throw new EngineError("not_found", "No such track.");
      const match = action === "retry" ? await jobs.retry(job, index) : jobs.edit(job, index, action, candidate);
      return { match, counts: job.counts() };
    }),
    search: wrap(async (jobId: string, index: number, query: string) => {
      const job = jobs.get(jobId);
      if (!query.trim()) throw new EngineError("bad_request", "Empty query.");
      return { results: await jobs.searchFor(job, index, query.trim().slice(0, 200)) };
    }),
    retryErrors: wrap(async (jobId: string) => {
      const job = jobs.get(jobId);
      return { queued: jobs.retryErrors(job), counts: job.counts() };
    }),
    links: wrap(async (jobId: string) => {
      const job = jobs.get(jobId);
      const ids = job.videoIds();
      if (!ids.length) throw new EngineError("no_matches", "No matched tracks yet.");
      return tempLinks(ids);
    }),
    reportCsv: wrap(async (jobId: string) => reportCsv(jobs.get(jobId))),
    setStage: (jobId, stage) => {
      try {
        jobs.setStage(jobs.get(jobId), stage);
      } catch {
        /* job gone */
      }
    },
    session: wrap(() => getSession()),
    save: wrap(async (jobId: string, options: { privacy: Privacy; title?: string }, onProgress: (p: SaveProgress) => void) => {
      const job = jobs.get(jobId);
      const ids = job.videoIds();
      if (!ids.length) throw new EngineError("no_matches", "No matched tracks to save.");
      const title = options.title ?? job.playlist?.name ?? "Converted playlist";
      const result = await savePlaylist(ids, { title, privacy: options.privacy }, job.saveState, onProgress);
      if (!("failed" in result)) jobs.markSaved(job);
      return result;
    }),
    resumable: async () => {
      const s = await store.load();
      if (!s?.playlist || s.saved) return null;
      return {
        job_id: s.id,
        playlist_name: s.playlist.name,
        matched: s.matches.filter((m) => m.status === "matched").length,
        total: s.matches.length,
        stage: s.stage,
      };
    },
    resume: wrap(async (jobId: string) => {
      const s = await store.load();
      if (!s || s.id !== jobId) throw new EngineError("job_lost", "That conversion is no longer available.");
      const job = jobs.resume(s);
      return { job_id: job.id, stage: s.stage };
    }),
    discard: async (jobId) => store.remove(jobId).catch(() => {}),
    clearCache: async () => {
      await cache.clear().catch(() => {});
      const s = await store.load();
      if (s) await store.remove(s.id).catch(() => {});
    },
  };
}

export const engine: Engine = createEngine();

// Port of apps/spotify-to-youtube/backend/app/jobs.py, running in the extension page.
// Same event stream as the web app's SSE: fetching? → playlist → match* → done | failed.
import { EngineError } from "./errors";
import { fetchPlaylist, parseTrackText } from "./sources";
import type { Candidate, Counts, JobEvent, Match, Playlist, PlaylistInfo, ResumeSnapshot } from "./types";
import { confidenceFor, rank } from "./youtube/matcher";
import { Searcher } from "./youtube/search";

export type Stage = ResumeSnapshot["stage"];
export type JobStatus = "fetching" | "matching" | "ready" | "failed";

export interface JobSnapshot {
  id: string;
  link: string | null;
  text: string | null;
  name: string | null;
  playlist: Playlist | null;
  matches: Match[];
  finished: boolean;
  stage: Stage;
  saved: boolean;
  updatedAt: number;
}

export interface JobStore {
  save(snapshot: JobSnapshot): Promise<void>;
  load(): Promise<JobSnapshot | null>;
  remove(id: string): Promise<void>;
}

type Listener = (event: JobEvent) => void;

class Semaphore {
  private queue: (() => void)[] = [];
  constructor(private free: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.free > 0) this.free--;
    else await new Promise<void>((resolve) => this.queue.push(resolve));
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.free++;
    }
  }
}

export class Job {
  status: JobStatus = "fetching";
  playlist: Playlist | null = null;
  matches: Match[] = [];
  finished = false;
  stage: Stage = "matching";
  saved = false;
  readonly events: JobEvent[] = [];
  private listeners = new Set<Listener>();

  constructor(
    readonly id: string,
    readonly link: string | null,
    readonly text: string | null,
    readonly name: string | null,
  ) {}

  emit(event: JobEvent) {
    this.events.push(event);
    for (const l of this.listeners) l(event);
  }

  subscribe(listener: Listener): () => void {
    for (const e of this.events) listener(e);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  counts(): Counts {
    const c: Counts = { total: this.matches.length, done: 0, high: 0, medium: 0, low: 0, not_found: 0, removed: 0, error: 0 };
    for (const m of this.matches) {
      if (m.status !== "pending") c.done++;
      if (m.status === "matched" && (m.confidence === "high" || m.confidence === "medium" || m.confidence === "low")) c[m.confidence]++;
      else if (m.status === "not_found" || m.status === "removed" || m.status === "error") c[m.status]++;
    }
    return c;
  }

  videoIds(): string[] {
    return this.matches.filter((m) => m.status === "matched" && m.chosen).map((m) => m.chosen!.video_id);
  }

  playlistInfo(): PlaylistInfo | null {
    if (!this.playlist) return null;
    const { tracks, ...info } = this.playlist;
    return { ...info, track_count: tracks.length };
  }

  snapshot(): JobSnapshot {
    return {
      id: this.id, link: this.link, text: this.text, name: this.name, playlist: this.playlist,
      matches: this.matches, finished: this.finished, stage: this.stage, saved: this.saved, updatedAt: Date.now(),
    };
  }
}

const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);

export class JobManager {
  private jobs = new Map<string, Job>();
  private slots: Semaphore;
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    readonly searcher: Searcher,
    private store: JobStore | null = null,
    private options: { concurrency?: number; maxTracks?: number } = {},
  ) {
    this.slots = new Semaphore(options.concurrency ?? 3);
  }

  get(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new EngineError("job_lost", "This conversion is no longer available.");
    return job;
  }

  create(input: { link?: string; text?: string; name?: string }): Job {
    const job = new Job(newId(), input.link?.trim() || null, input.text ?? null, input.name?.trim().slice(0, 120) || null);
    this.jobs.set(job.id, job);
    void this.run(job);
    return job;
  }

  /** Re-open a saved conversion: replay its state and finish any searches that didn't complete. */
  resume(snapshot: JobSnapshot): Job {
    const job = new Job(snapshot.id, snapshot.link, snapshot.text, snapshot.name);
    job.playlist = snapshot.playlist;
    job.matches = snapshot.matches.map((m) => (m.status === "pending" ? m : { ...m }));
    job.stage = snapshot.stage;
    job.saved = snapshot.saved;
    job.status = "matching";
    this.jobs.set(job.id, job);
    job.emit({ type: "playlist", data: { playlist: job.playlistInfo()!, matches: job.matches, counts: job.counts() } });
    void (async () => {
      await Promise.all(job.matches.filter((m) => m.status === "pending").map((m) => this.matchOne(job, m)));
      job.status = "ready";
      job.finished = true;
      job.emit({ type: "done", data: { counts: job.counts() } });
      this.persist(job);
    })();
    return job;
  }

  setStage(job: Job, stage: Stage) {
    job.stage = stage;
    this.persist(job, true);
  }

  markSaved(job: Job) {
    job.saved = true;
    this.persist(job, true);
  }

  private persist(job: Job, immediate = false) {
    if (!this.store || !job.playlist) return;
    clearTimeout(this.persistTimers.get(job.id));
    const write = () => void this.store!.save(job.snapshot()).catch(() => {});
    if (immediate) write();
    else this.persistTimers.set(job.id, setTimeout(write, 400));
  }

  private async run(job: Job) {
    try {
      if (job.link) {
        job.playlist = await fetchPlaylist(job.link, {
          maxTracks: this.options.maxTracks ?? 500,
          onMetadata: (playlist, loadingMore) => {
            const { tracks: _tracks, ...info } = playlist;
            job.emit({ type: "fetching", data: { playlist: { ...info, track_count: null }, loading_more: loadingMore } });
          },
          onRecovering: () => {
            const last = [...job.events].reverse().find((e) => e.type === "fetching");
            if (last?.type === "fetching") job.emit({ type: "fetching", data: { ...last.data, recovering: true } });
          },
        });
      } else {
        job.playlist = parseTrackText(job.text ?? "", job.name ?? "Pasted list");
      }
    } catch (e) {
      const err = e instanceof EngineError ? e : new EngineError("internal", String(e));
      return this.fail(job, err.code === "invalid_link" ? "invalid_link" : err.code, err.message);
    }

    if (!job.playlist.tracks.length) return this.fail(job, "empty", "No tracks found.");
    job.matches = job.playlist.tracks.map((track, index) => ({
      index, track, status: "pending", confidence: null, chosen: null, alternatives: [], error: null, picked: false,
    }));
    job.status = "matching";
    job.emit({ type: "playlist", data: { playlist: job.playlistInfo()!, matches: job.matches } });
    this.persist(job, true);

    await Promise.all(job.matches.map((m) => this.matchOne(job, m)));
    job.status = "ready";
    job.finished = true;
    job.emit({ type: "done", data: { counts: job.counts() } });
    this.persist(job, true);
  }

  private fail(job: Job, code: string, message: string) {
    job.status = "failed";
    job.emit({ type: "failed", data: { code, message } });
  }

  /** Search results are saved in batches; user edits (`immediate`) are saved straight away. */
  private update(job: Job, match: Match, immediate = false) {
    job.matches[match.index] = match;
    job.emit({ type: "match", data: { match, counts: job.counts() } });
    this.persist(job, immediate);
  }

  private async matchOne(job: Job, match: Match) {
    let next: Match;
    try {
      const ranked = await this.slots.run(() => this.searcher.find(match.track));
      next = applyRanking(match, ranked);
    } catch (e) {
      next = { ...match, status: "error", error: e instanceof Error ? e.message : String(e) };
    }
    this.update(job, next);
  }

  async retry(job: Job, index: number): Promise<Match> {
    const match = { ...job.matches[index]!, status: "pending" as const, error: null };
    this.update(job, match);
    await this.matchOne(job, match);
    return job.matches[index]!;
  }

  retryErrors(job: Job): number {
    const failed = job.matches.filter((m) => m.status === "error");
    for (const m of failed) this.update(job, { ...m, status: "pending", error: null });
    void Promise.all(failed.map((m) => this.matchOne(job, job.matches[m.index]!)));
    return failed.length;
  }

  async searchFor(job: Job, index: number, query: string): Promise<Candidate[]> {
    return rank(job.matches[index]!.track, await this.searcher.freeText(query));
  }

  edit(job: Job, index: number, action: "choose" | "remove" | "restore", candidate?: Candidate): Match {
    const match = { ...job.matches[index]! };
    if (action === "remove") match.status = "removed";
    else if (action === "restore") match.status = match.chosen ? "matched" : "not_found";
    else if (action === "choose" && candidate) {
      const known = match.alternatives.find((c) => c.video_id === candidate.video_id);
      const chosen = known ?? candidate;
      const previous = match.chosen;
      // Keep the old pick around as an alternative so the user can switch back.
      const pool = [previous, ...match.alternatives, candidate].filter((c): c is Candidate => !!c && c.video_id !== chosen.video_id);
      match.alternatives = [...new Map(pool.map((c) => [c.video_id, c])).values()].slice(0, 4);
      match.chosen = chosen;
      match.status = "matched";
      match.picked = true;
      const conf = chosen.score ? confidenceFor(chosen.score) : "high";
      match.confidence = conf === "none" ? "low" : conf;
    } else throw new EngineError("bad_request", "Unknown action.");
    this.update(job, match, true);
    return match;
  }
}

export function applyRanking(match: Match, ranked: Candidate[]): Match {
  const best = ranked[0];
  const confidence = best ? confidenceFor(best.score) : "none";
  if (best && confidence !== "none") {
    return { ...match, status: "matched", confidence, chosen: best, alternatives: ranked.slice(1, 5), picked: false, error: null };
  }
  return { ...match, status: "not_found", confidence, chosen: null, alternatives: ranked.slice(0, 4), picked: false, error: null };
}

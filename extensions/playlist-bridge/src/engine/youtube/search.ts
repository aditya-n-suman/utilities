// Port of apps/spotify-to-youtube/backend/app/youtube/search.py.
// Layers (stop as soon as the best candidate is good enough):
//   1. YouTube Music "songs" catalog (official audio)  2. YouTube Music "videos"  3. youtube.com search
import { EngineError } from "../errors";
import type { Candidate, Track } from "../types";
import { youtubeSearch, ytmSearch } from "./innertube";
import { HIGH, MEDIUM, rank, searchQuery } from "./matcher";

export class SearchFailed extends EngineError {
  constructor(message = "YouTube search is unavailable right now.") {
    super("search_unavailable", message);
  }
}

export interface MatchCache {
  get(track: Track): Promise<Candidate[] | null>;
  put(track: Track, candidates: Candidate[]): Promise<void>;
}

export interface SearchBackend {
  ytm(query: string, kind: "songs" | "videos", limit?: number): Promise<Candidate[]>;
  youtube(query: string, limit?: number): Promise<Candidate[]>;
}

export const liveBackend: SearchBackend = { ytm: ytmSearch, youtube: youtubeSearch };

/** Skip a layer that keeps returning nothing (e.g. the songs catalog from some networks). */
export class Breaker {
  private emptyStreak = 0;
  private openUntil = 0;
  constructor(private threshold = 3, private cooldownMs = 600_000, private now = () => Date.now()) {}
  get open() {
    return this.now() < this.openUntil;
  }
  record(empty: boolean) {
    this.emptyStreak = empty ? this.emptyStreak + 1 : 0;
    if (this.emptyStreak >= this.threshold) {
      this.openUntil = this.now() + this.cooldownMs;
      this.emptyStreak = 0;
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Searcher {
  readonly songsBreaker = new Breaker();
  constructor(
    private cache: MatchCache | null,
    private backend: SearchBackend = liveBackend,
    private retries = 2,
    private backoffMs = 1500,
  ) {}

  /** Runs a search with retry; null means the layer errored. */
  private async call(fn: () => Promise<Candidate[]>): Promise<Candidate[] | null> {
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await fn();
      } catch {
        if (attempt < this.retries) await sleep(this.backoffMs * 2 ** attempt);
      }
    }
    return null;
  }

  /** Ranked candidates for a track, best first (may be empty). */
  async find(track: Track): Promise<Candidate[]> {
    const cached = this.cache ? await this.cache.get(track) : null;
    if (cached) return cached;

    const query = searchQuery(track);
    const pool: Candidate[] = [];
    let failures = 0;

    if (!this.songsBreaker.open) {
      const songs = await this.call(() => this.backend.ytm(query, "songs"));
      if (songs === null) failures++;
      else {
        this.songsBreaker.record(songs.length === 0);
        pool.push(...songs);
      }
    }
    let ranked = rank(track, pool);

    if (!ranked.length || ranked[0]!.score < HIGH) {
      const videos = await this.call(() => this.backend.ytm(query, "videos"));
      if (videos === null) failures++;
      pool.push(...(videos ?? []));
      ranked = rank(track, pool);
    }

    if (!ranked.length || ranked[0]!.score < MEDIUM) {
      const plain = await this.call(() => this.backend.youtube(query));
      if (plain === null) failures++;
      pool.push(...(plain ?? []));
      ranked = rank(track, pool);
    }

    if (!ranked.length && failures) throw new SearchFailed();
    if (this.cache && ranked.length) await this.cache.put(track, ranked.slice(0, 5));
    return ranked;
  }

  /** Manual search from the review screen. */
  async freeText(query: string, limit = 8): Promise<Candidate[]> {
    let results = await this.call(() => this.backend.ytm(query, "videos", limit));
    if (!results?.length) results = await this.call(() => this.backend.youtube(query, limit));
    if (results === null) throw new SearchFailed();
    return results;
  }
}

// Track → ranked YouTube candidates, kept in this browser (IndexedDB) for 30 days.
import { clear, createStore, get, set, type UseStore } from "idb-keyval";
import type { Candidate, Track } from "./types";
import type { MatchCache } from "./youtube/search";
import { cleanTitle, normalize } from "./youtube/matcher";

const TTL_MS = 30 * 24 * 3600 * 1000;

/** Python's round(): halves go to the even neighbour (36.5 → 36). */
const roundHalfEven = (x: number) => {
  const f = Math.floor(x);
  const d = x - f;
  return d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x);
};

/** Same key as the web app's cache.py. */
export function cacheKey(track: Track): string {
  const bucket = track.duration_ms ? roundHalfEven(track.duration_ms / 5000) : "-";
  const artists = normalize([...track.artists].sort().join(" "));
  return `${artists}|${normalize(cleanTitle(track.title))}|${bucket}`;
}

export class IdbMatchCache implements MatchCache {
  private store: UseStore;
  constructor(store?: UseStore) {
    this.store = store ?? createStore("playlist-bridge-matches", "matches");
  }
  async get(track: Track): Promise<Candidate[] | null> {
    try {
      const row = await get<{ candidates: Candidate[]; at: number }>(cacheKey(track), this.store);
      return row && Date.now() - row.at <= TTL_MS ? row.candidates : null;
    } catch {
      return null;
    }
  }
  async put(track: Track, candidates: Candidate[]): Promise<void> {
    try {
      await set(cacheKey(track), { candidates, at: Date.now() }, this.store);
    } catch {
      /* quota or private mode: caching is best-effort */
    }
  }
  async clear(): Promise<void> {
    await clear(this.store);
  }
}

// Online lyrics results, kept in the extension's IndexedDB (not YouTube's) for 30 days, so replaying a song
// costs no requests. Used by the background; the app's "Clear saved matches" clears it too.
import { clear, createStore, get, set, type UseStore } from "idb-keyval";

const TTL_MS = 30 * 24 * 3600 * 1000;
let store: UseStore | null = null;
const lyricsStore = () => (store ??= createStore("playlist-bridge-lyrics", "lines"));

/** Returns the cached value for `key`, or runs `load` and caches what it returns (null results aren't cached). */
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const row = await get<{ value: T; at: number }>(key, lyricsStore());
    if (row && Date.now() - row.at <= TTL_MS) return row.value;
  } catch {
    /* no IndexedDB (private mode): just load */
  }
  const value = await load();
  if (value != null) await set(key, { value, at: Date.now() }, lyricsStore()).catch(() => {});
  return value;
}

export async function clearLyricsCache(): Promise<void> {
  await clear(lyricsStore()).catch(() => {});
}

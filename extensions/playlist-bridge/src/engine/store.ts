// The most recent conversion, kept so the landing page can offer "Pick up where you left off".
import { createStore, del, get, set, type UseStore } from "idb-keyval";
import type { JobSnapshot, JobStore } from "./jobs";

const KEY = "current";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export class IdbJobStore implements JobStore {
  private store: UseStore;
  constructor(store?: UseStore) {
    this.store = store ?? createStore("playlist-bridge-jobs", "jobs");
  }
  async save(snapshot: JobSnapshot) {
    await set(KEY, snapshot, this.store);
  }
  async load(): Promise<JobSnapshot | null> {
    try {
      const s = await get<JobSnapshot>(KEY, this.store);
      return s && Date.now() - s.updatedAt <= MAX_AGE_MS ? s : null;
    } catch {
      return null;
    }
  }
  async remove(id: string) {
    const s = await this.load();
    if (!s || s.id === id) await del(KEY, this.store);
  }
}

// One working copy of the resume in localStorage. The downloaded JSON is the
// user's real save; this only spares them losing work between visits on the
// same browser (UX.md, "Saving"). Every access is guarded: private windows and
// blocked storage throw, and the app keeps working from memory.

import type { Resume } from "../lib/types";

const KEY = "folio.draft.v1";

export interface DraftUi {
  tab?: "content" | "design";
  open?: string | null;
}

export interface Draft {
  doc: Resume;
  ui?: DraftUi;
  savedAt: string;
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && typeof d === "object" && d.doc && typeof d.doc === "object" ? d : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refused (full, blocked, private mode). */
export function saveDraft(doc: Resume, ui?: DraftUi): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ doc, ui, savedAt: new Date().toISOString() } satisfies Draft));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to remove */
  }
}

/** "2 days ago", "just now". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s) || s < 60) return "just now";
  const units: [number, string][] = [[86400 * 30, "month"], [86400 * 7, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [n, u] of units) if (s >= n) { const v = Math.floor(s / n); return `${v} ${u}${v > 1 ? "s" : ""} ago`; }
  return "just now";
}

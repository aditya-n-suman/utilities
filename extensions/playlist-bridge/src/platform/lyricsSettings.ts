import { browser } from "wxt/browser";
import type { Mode } from "@/engine/lyrics/pipeline";
import { MODES } from "@/engine/lyrics/pipeline";

/** What the lyrics bar on YouTube Music remembers, in extension storage (shared by all tabs). */
export interface LyricsSettings {
  mode: Mode;
  /** The user allowed Google Translate online on the lyrics bar. */
  online: boolean;
}

const KEY = "pb-lyrics";
const DEFAULTS: LyricsSettings = { mode: "off", online: false };

export async function loadLyricsSettings(): Promise<LyricsSettings> {
  try {
    const s = (await browser.storage.local.get(KEY))[KEY] as Partial<LyricsSettings> | undefined;
    return { mode: s?.mode && MODES.includes(s.mode) ? s.mode : DEFAULTS.mode, online: s?.online === true };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveLyricsSettings(settings: LyricsSettings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings }).catch(() => {});
}

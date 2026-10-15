// Messages between the YouTube Music lyrics bar (content script) and the background, which makes the online
// requests and caches them.
import { browser } from "wxt/browser";
import type { OnlineResult } from "./google";

export type LyricsRequest =
  | { type: "pb:lyrics-online"; text: string; target: string }
  | { type: "pb:lyrics-native"; text: string; lang: string };
export type LyricsResponse = { ok: true; value: unknown } | { ok: false; error: string };

async function ask<T>(request: LyricsRequest): Promise<T> {
  const res = (await browser.runtime.sendMessage(request)) as LyricsResponse | undefined;
  if (!res) throw new Error("The extension didn't answer. Reload the page.");
  if (!res.ok) throw new Error(res.error);
  return res.value as T;
}

export const onlineLine = (text: string, target: string) => ask<OnlineResult>({ type: "pb:lyrics-online", text, target });
export const nativeLine = (text: string, lang: string) => ask<string | null>({ type: "pb:lyrics-native", text, lang });

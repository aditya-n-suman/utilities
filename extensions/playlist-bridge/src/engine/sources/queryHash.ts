// The fetchPlaylist persisted-query hash changes with Spotify web-player releases. When the stored
// one goes stale, read the current one out of the web player's JavaScript (replaces the web app's
// headless-browser fallback).
import { browser } from "wxt/browser";
import { SourceChanged } from "../errors";
import { http } from "../http";

export const DEFAULT_HASH = "8964e8eafb21aa992a7d951d256d83285c04be2105d209262901de70cb97584a";
const STORAGE_KEY = "spotifyFetchPlaylistHash";
const BUNDLE_RE = /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[0-9a-f]+\.js/;
const HASH_RE = /"fetchPlaylist","query","([0-9a-f]{64})"/;

export async function currentHash(): Promise<string> {
  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    if (typeof stored === "string" && /^[0-9a-f]{64}$/.test(stored)) return stored;
  } catch {
    /* storage unavailable (tests) */
  }
  return DEFAULT_HASH;
}

export function extractBundleUrl(html: string): string | null {
  return html.match(BUNDLE_RE)?.[0] ?? null;
}

export function extractHash(js: string): string | null {
  return js.match(HASH_RE)?.[1] ?? null;
}

/** Fetch the web player and pull out the current hash; remembers it for next time. */
export async function discoverHash(): Promise<string> {
  const home = await (await http("https://open.spotify.com/", { credentials: "omit" })).text();
  const bundleUrl = extractBundleUrl(home);
  if (!bundleUrl) throw new SourceChanged("Couldn't find Spotify's web-player script.");
  const js = await (await http(bundleUrl, { credentials: "omit", timeoutMs: 60_000 })).text();
  const hash = extractHash(js);
  if (!hash) throw new SourceChanged("Couldn't find the playlist query in Spotify's web player.");
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: hash });
  } catch {
    /* storage unavailable (tests) */
  }
  return hash;
}

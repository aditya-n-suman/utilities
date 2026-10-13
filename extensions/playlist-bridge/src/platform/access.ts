import { browser } from "wxt/browser";

/** Sites the extension needs, with the reason shown on the "One more step" screen. Keep in sync with wxt.config.ts. */
export const SITES = [
  { host: "open.spotify.com", reason: "Read the playlist you open" },
  { host: "api-partner.spotify.com", reason: "Load the full track list" },
  { host: "open.spotifycdn.com", reason: "Reconnect when Spotify updates" },
  { host: "music.youtube.com", reason: "Find each song and save your playlist" },
  { host: "www.youtube.com", reason: "Search YouTube when a song isn’t on YouTube Music" },
] as const;

const ORIGINS = SITES.map((s) => `https://${s.host}/*`);

export async function hasAccess(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: ORIGINS });
  } catch {
    return false;
  }
}

/** Must be called from a user gesture (click), or browsers ignore it. */
export async function requestAccess(): Promise<boolean> {
  try {
    return await browser.permissions.request({ origins: ORIGINS });
  } catch {
    return false;
  }
}

/** Calls back with the new state whenever site access is granted or revoked. Returns an unsubscribe function. */
export function onAccessChange(callback: (granted: boolean) => void): () => void {
  const handler = () => void hasAccess().then(callback);
  browser.permissions.onAdded.addListener(handler);
  browser.permissions.onRemoved.addListener(handler);
  return () => {
    browser.permissions.onAdded.removeListener(handler);
    browser.permissions.onRemoved.removeListener(handler);
  };
}

const SHORT_LINK_ORIGINS = ["https://spotify.link/*", "https://spoti.fi/*"];

/** Optional permission for spotify.link / spoti.fi. Call straight from a click handler. */
export async function ensureShortLinkAccess(): Promise<boolean> {
  // No await before request(): Firefox only allows it synchronously inside the click.
  // request() resolves true straight away when access is already granted.
  try {
    return await browser.permissions.request({ origins: SHORT_LINK_ORIGINS });
  } catch {
    return false;
  }
}

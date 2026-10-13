// The YouTube account the user is already signed into in this browser (same approach as
// ytmusicapi's "browser auth"): requests carry the session cookies plus a SAPISIDHASH header.
// Only used for "Save to my YouTube account"; searches never send cookies.
import { browser } from "wxt/browser";
import { EngineError } from "../errors";
import type { Session } from "../types";
import { findAll, YTM_BASE, YTM_KEY, ytmContext } from "./innertube";

const ORIGIN = "https://music.youtube.com";

export class NotSignedIn extends EngineError {
  constructor(message = "Sign in to YouTube in this browser to save.") {
    super("not_signed_in", message);
  }
}

export type SapisidLookup = () => Promise<string | null>;

/** The SAPISID cookie (or its __Secure-3P twin) from music.youtube.com / www.youtube.com. */
export const cookieSapisid: SapisidLookup = async () => {
  for (const url of [ORIGIN, "https://www.youtube.com"]) {
    for (const name of ["SAPISID", "__Secure-3PAPISID"]) {
      try {
        const c = await browser.cookies.get({ url, name });
        if (c?.value) return c.value;
      } catch {
        /* cookies API unavailable */
      }
    }
  }
  return null;
};

export async function sapisidHash(sapisid: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${nowSeconds} ${sapisid} ${ORIGIN}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `SAPISIDHASH ${nowSeconds}_${hex}`;
}

/** POST to YouTube Music's internal API as the signed-in user. */
export async function ytmAuthed(endpoint: string, body: object, getSapisid: SapisidLookup = cookieSapisid): Promise<any> {
  const sapisid = await getSapisid();
  if (!sapisid) throw new NotSignedIn();
  const resp = await fetch(`${YTM_BASE}${endpoint}?alt=json&key=${YTM_KEY}&prettyPrint=false`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: await sapisidHash(sapisid),
      "X-Goog-AuthUser": "0",
      "X-Origin": ORIGIN,
    },
    body: JSON.stringify({ context: ytmContext(), ...body }),
    signal: AbortSignal.timeout(30_000),
  });
  if (resp.status === 401 || resp.status === 403) throw new NotSignedIn("Your YouTube sign-in expired. Sign in again to finish.");
  if (!resp.ok) throw new EngineError("save_failed", `YouTube returned ${resp.status}.`);
  return resp.json();
}

/** Port of ytmusicapi get_account_info (account/account_menu). */
export function parseAccountMenu(response: any): Session {
  const header = findAll(response, "activeAccountHeaderRenderer")[0];
  const name: string | undefined = header?.accountName?.runs?.[0]?.text;
  if (!name) return { signed_in: false };
  const photos: { url: string; width?: number }[] = header?.accountPhoto?.thumbnails ?? [];
  const best = photos.reduce<{ url: string; width?: number } | undefined>((a, b) => (!a || (b.width ?? 0) > (a.width ?? 0) ? b : a), undefined);
  return { signed_in: true, name, handle: header?.channelHandle?.runs?.[0]?.text, avatar_url: best?.url };
}

export async function getSession(getSapisid: SapisidLookup = cookieSapisid): Promise<Session> {
  try {
    return parseAccountMenu(await ytmAuthed("account/account_menu", {}, getSapisid));
  } catch (e) {
    if (e instanceof NotSignedIn) return { signed_in: false };
    throw e;
  }
}

/**
 * Calls `callback` when the browser's YouTube sign-in changes (signed in, signed out or a new session),
 * in any tab. It polls the SAPISID cookie: a local read, no network. `cookies.onChanged` would need host
 * access to all of youtube.com, because the sign-in cookies are set on `.youtube.com`. Returns a stop function.
 */
export function onSessionChange(callback: () => void, intervalMs = 2000, getSapisid: SapisidLookup = cookieSapisid): () => void {
  let last: string | null | undefined;
  let stopped = false;
  const tick = async () => {
    const now = await getSapisid();
    if (stopped) return;
    if (last !== undefined && now !== last) callback();
    last = now;
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

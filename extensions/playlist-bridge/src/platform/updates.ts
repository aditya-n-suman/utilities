import { browser } from "wxt/browser";
import { version } from "./links";

// The extension isn't in a store, so nothing updates it. Once a day it asks GitHub for the newest
// playlist-bridge release and the header offers it. Only the public releases list is fetched, without cookies.
const RELEASES_API = "https://api.github.com/repos/aditya-n-suman/utilities/releases?per_page=50";
export const TAG_PREFIX = "playlist-bridge-v";
const STORAGE_KEY = "pb-update-check";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Release {
  version: string;
  url: string;
}

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

type Stored = { checkedAt: number; latest: Release | null };

function parse(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? m.slice(1).map(Number) : null;
}

/** True when `a` is a higher x.y.z version than `b`. Anything unparseable is never newer. */
export function isNewer(a: string, b: string): boolean {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return false;
  const i = pa.findIndex((n, k) => n !== pb[k]);
  return i !== -1 && pa[i]! > pb[i]!;
}

/** Highest published playlist-bridge release. The repo has other utilities, so other tags are ignored. */
export function pickLatest(releases: GitHubRelease[]): Release | null {
  let best: Release | null = null;
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name?.startsWith(TAG_PREFIX) || !r.html_url) continue;
    const v = r.tag_name.slice(TAG_PREFIX.length);
    if (!parse(v)) continue;
    if (!best || isNewer(v, best.version)) best = { version: v, url: r.html_url };
  }
  return best;
}

async function latestRelease(): Promise<Release | null> {
  const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Stored | undefined;
  if (stored && Date.now() - stored.checkedAt < DAY_MS) return stored.latest;
  const res = await fetch(RELEASES_API, { credentials: "omit", headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const latest = pickLatest((await res.json()) as GitHubRelease[]);
  await browser.storage.local.set({ [STORAGE_KEY]: { checkedAt: Date.now(), latest } satisfies Stored });
  return latest;
}

/** The newer release if there is one, otherwise null. Never throws: offline or rate-limited just means no notice. */
export async function checkForUpdate(): Promise<Release | null> {
  try {
    const latest = await latestRelease();
    return latest && isNewer(latest.version, version()) ? latest : null;
  } catch {
    return null;
  }
}

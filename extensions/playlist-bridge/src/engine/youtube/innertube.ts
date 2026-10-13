// YouTube's internal ("InnerTube") search API, as used by ytmusicapi (YouTube Music) and yt-dlp
// (youtube.com). No API key quota applies; the key below is the public one YouTube's own web player
// sends. Origin/Referer are set by the extension's declarativeNetRequest rules (requests are rejected
// with 403 without them).
import { EngineError } from "../errors";
import type { Candidate } from "../types";

export const YTM_BASE = "https://music.youtube.com/youtubei/v1/";
export const YTM_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
export const SEARCH_PARAMS = { songs: "EgWKAQIIAWoMEA4QChADEAQQCRAF", videos: "EgWKAQIQAWoMEA4QChADEAQQCRAF" } as const;

const today = () => new Date().toISOString().slice(0, 10).replaceAll("-", "");
export const ytmContext = () => ({ client: { clientName: "WEB_REMIX", clientVersion: `1.${today()}.01.00`, hl: "en" }, user: {} });
const ytContext = () => ({ client: { clientName: "WEB", clientVersion: `2.${today()}.00.00`, hl: "en" } });

export class SearchHttpError extends EngineError {
  constructor(readonly status: number, where: string) {
    super("search_unavailable", `${where} search returned ${status}.`);
  }
}

async function postJson(url: string, body: unknown, where: string): Promise<any> {
  const resp = await fetch(url, {
    method: "POST",
    credentials: "omit", // searches never touch the user's YouTube account
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new SearchHttpError(resp.status, where);
  return resp.json();
}

/** Every value stored under `key` anywhere in a JSON tree, in document order. */
export function findAll(node: unknown, key: string, out: any[] = []): any[] {
  if (Array.isArray(node)) for (const v of node) findAll(v, key, out);
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      else findAll(v, key, out);
    }
  }
  return out;
}

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function parseDurationText(text?: string | null): number | null {
  const t = (text ?? "").trim();
  if (!/^(\d+:)*\d+:\d+$/.test(t)) return null;
  return t.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

// ---- YouTube Music (port of ytmusicapi parse_search_result / parse_song_runs, songs + videos) ----

type Run = { text: string; navigationEndpoint?: any };
const DOT = " • ";
const VIEWS_RE = /^\d[\d.,]*\s*[KMB]?\s+(views|plays)$/i;

function classifyRun(run: Run): "album" | "artist" | "duration" | "year" | "views" {
  if (run.navigationEndpoint) {
    const id: string | undefined = run.navigationEndpoint?.browseEndpoint?.browseId;
    return id && (id.startsWith("MPRE") || id.includes("release_detail")) ? "album" : "artist";
  }
  if (/^(\d+:)*\d+:\d+$/.test(run.text)) return "duration";
  if (/^\d{4}$/.test(run.text)) return "year";
  if (VIEWS_RE.test(run.text)) return "views";
  return "artist";
}

const flexRuns = (item: any, index: number): Run[] | null =>
  item?.flexColumns?.[index]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? null;

export interface YtmResult {
  resultType: "song" | "video";
  videoId: string;
  title: string;
  artists: string[];
  duration_seconds: number | null;
  isExplicit: boolean;
}

export function parseYtmItem(item: any, resultType: "song" | "video"): YtmResult | null {
  const title = flexRuns(item, 0)?.[0]?.text;
  const videoId =
    item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ??
    item?.playlistItemData?.videoId;
  if (!title || !videoId) return null;

  let runs = [...(flexRuns(item, 1) ?? [])];
  const third = flexRuns(item, 2);
  if (third) runs.push({ text: "" }, ...third);
  // Skip a leading type label ("Song • Artist …").
  if (
    runs.length > 2 && !runs[0]!.navigationEndpoint && classifyRun(runs[0]!) === "artist" && runs[1]!.text === DOT &&
    ["artist", "duration", "views", "year"].includes(classifyRun(runs[2]!))
  ) {
    runs = runs.slice(2);
  }
  const artists: string[] = [];
  let duration: number | null = null;
  runs.forEach((run, i) => {
    if (i % 2) return; // odd items are separators
    const kind = classifyRun(run);
    if (kind === "artist") artists.push(run.text);
    else if (kind === "duration") duration = parseDurationText(run.text);
  });
  return {
    resultType,
    videoId,
    title,
    artists,
    duration_seconds: duration,
    isExplicit: item?.badges?.[0]?.musicInlineBadgeRenderer?.accessibilityData?.accessibilityData?.label != null,
  };
}

export function parseYtmSearch(response: any, kind: "songs" | "videos"): YtmResult[] {
  if (!response?.contents) return [];
  const resultType = kind === "songs" ? "song" : "video";
  return findAll(response.contents, "musicResponsiveListItemRenderer")
    .map((item) => parseYtmItem(item, resultType))
    .filter((r): r is YtmResult => r !== null);
}

export function ytmToCandidates(results: YtmResult[]): Candidate[] {
  return results.map((r) => ({
    video_id: r.videoId,
    title: r.title,
    channel: r.artists.join(", ") || null,
    duration_s: r.duration_seconds,
    source: r.resultType === "song" ? "ytmusic_song" : "ytmusic_video",
    score: 0,
    thumbnail: thumb(r.videoId),
    url: watch(r.videoId),
  }));
}

export async function ytmSearch(query: string, kind: "songs" | "videos", limit = 5): Promise<Candidate[]> {
  const response = await postJson(
    `${YTM_BASE}search?alt=json&key=${YTM_KEY}&prettyPrint=false`,
    { context: ytmContext(), query, params: SEARCH_PARAMS[kind] },
    "YouTube Music",
  );
  return ytmToCandidates(parseYtmSearch(response, kind)).slice(0, limit);
}

// ---- youtube.com (what yt-dlp's ytsearch reads: videoRenderer items) ----

export function parseYoutubeSearch(response: any): Candidate[] {
  return findAll(response?.contents, "videoRenderer")
    .filter((v) => v?.videoId)
    .map((v) => ({
      video_id: v.videoId as string,
      title: v.title?.runs?.map((r: Run) => r.text).join("") ?? v.title?.simpleText ?? "",
      channel: v.ownerText?.runs?.[0]?.text ?? v.longBylineText?.runs?.[0]?.text ?? null,
      duration_s: parseDurationText(v.lengthText?.simpleText),
      source: "ytdlp",
      score: 0,
      thumbnail: thumb(v.videoId),
      url: watch(v.videoId),
    }));
}

export async function youtubeSearch(query: string, limit = 5): Promise<Candidate[]> {
  const response = await postJson("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", { context: ytContext(), query }, "YouTube");
  return parseYoutubeSearch(response).slice(0, limit);
}

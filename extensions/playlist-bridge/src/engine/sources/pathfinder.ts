// Tier 2: page through the web player's GraphQL endpoint with the embed's anonymous token.
import { PlaylistUnavailable, SourceChanged, StaleQueryHash } from "../errors";
import { http } from "../http";
import type { Track } from "../types";
import { largestImage } from "./embed";

export const PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
export const PAGE_SIZE = 100;

export function fetchPlaylistBody(playlistId: string, offset: number, limit: number, queryHash: string) {
  return {
    variables: {
      uri: `spotify:playlist:${playlistId}`,
      offset,
      limit,
      enableWatchFeedEntrypoint: false,
      includeEpisodeContentRatingsV2: true,
    },
    operationName: "fetchPlaylist",
    extensions: { persistedQuery: { version: 1, sha256Hash: queryHash } },
  };
}

export function parsePlaylistItems(items: any[]): Track[] {
  const tracks: Track[] = [];
  for (const item of items) {
    const data = item?.itemV2?.data ?? {};
    if (data.__typename !== "Track" || !data.name) continue; // podcast episodes, local files, unavailable entries
    const album = data.albumOfTrack ?? {};
    tracks.push({
      title: data.name,
      artists: (data.artists?.items ?? []).filter((a: any) => a.profile).map((a: any) => a.profile.name),
      album: album.name ?? null,
      duration_ms: data.trackDuration?.totalMilliseconds ?? null,
      explicit: data.contentRating?.label === "EXPLICIT",
      spotify_uri: data.uri ?? null,
      cover_url: largestImage(album.coverArt?.sources),
    });
  }
  return tracks;
}

/** One fetchPlaylist response → tracks, totalCount and the playlistV2 object. */
export function parsePage(payload: any): { tracks: Track[]; total: number; playlist: any } {
  if (payload?.errors?.length && !payload.data) {
    const messages = payload.errors.map((e: any) => String(e?.message ?? "")).join(" ");
    if (/query hash|persisted/i.test(messages)) throw new StaleQueryHash(messages);
    throw new SourceChanged(messages);
  }
  const playlist = payload?.data?.playlistV2 ?? {};
  if (playlist.__typename === "GenericError" || playlist.__typename === "NotFound") {
    throw new PlaylistUnavailable(playlist.message || undefined);
  }
  const content = playlist.content;
  if (!content) throw new SourceChanged(`Unexpected fetchPlaylist response (${playlist.__typename}).`);
  return { tracks: parsePlaylistItems(content.items ?? []), total: Number(content.totalCount ?? 0), playlist };
}

/** Fetch tracks from `start` to the end (or `maxTracks`). */
export async function fetchAllTracks(
  playlistId: string,
  accessToken: string,
  { start = 0, maxTracks, queryHash }: { start?: number; maxTracks?: number; queryHash: string },
): Promise<{ tracks: Track[]; total: number }> {
  const tracks: Track[] = [];
  let offset = start;
  let total: number | null = null;
  while (total === null || offset < total) {
    if (maxTracks !== undefined && start + tracks.length >= maxTracks) break;
    const resp = await http(PATHFINDER_URL, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: `Bearer ${accessToken}`, "app-platform": "WebPlayer", "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify(fetchPlaylistBody(playlistId, offset, PAGE_SIZE, queryHash)),
    });
    const text = await resp.text();
    if (resp.status === 412 || /query hash/i.test(text.slice(0, 200))) throw new StaleQueryHash(text.slice(0, 200));
    if (!resp.ok) throw new SourceChanged(`Playlist API returned ${resp.status}.`);
    const page = parsePage(JSON.parse(text));
    tracks.push(...page.tracks);
    total = page.total;
    offset += PAGE_SIZE;
  }
  return { tracks, total: total ?? 0 };
}

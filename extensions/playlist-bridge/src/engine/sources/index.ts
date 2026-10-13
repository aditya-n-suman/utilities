// Read a public Spotify playlist from Spotify's web surface (no API keys).
//   Tier 1: embed page (metadata, first 100 tracks, anonymous token)
//   Tier 2: web-player GraphQL paging with that token (tracks 101+)
//   Recovery: if the query hash is stale, read the current one from the web player and retry once.
import { StaleQueryHash } from "../errors";
import type { Playlist } from "../types";
import { fetchEmbed } from "./embed";
import { fetchAllTracks } from "./pathfinder";
import { currentHash, discoverHash } from "./queryHash";
import { resolvePlaylistId } from "./resolve";

export { isShortLink, parsePlaylistId, SHORT_HOSTS } from "./resolve";
export { parseTrackText } from "./paste";

export interface FetchOptions {
  maxTracks?: number;
  /** Fires once the embed page is parsed, before paging. */
  onMetadata?: (playlist: Playlist, loadingMore: boolean) => void;
  /** Fires when the stale-hash recovery starts ("Reconnecting…"). */
  onRecovering?: () => void;
}

export async function fetchPlaylist(link: string, { maxTracks = 500, onMetadata, onRecovering }: FetchOptions = {}): Promise<Playlist> {
  const playlistId = await resolvePlaylistId(link);
  const embed = await fetchEmbed(playlistId);
  const playlist = embed.playlist;
  const loadingMore = embed.maybeTruncated && playlist.tracks.length < maxTracks && !!embed.accessToken;
  onMetadata?.(playlist, loadingMore);
  if (!loadingMore) {
    playlist.tracks = playlist.tracks.slice(0, maxTracks);
    return playlist;
  }

  const page = (queryHash: string) =>
    fetchAllTracks(playlistId, embed.accessToken!, { start: playlist.tracks.length, maxTracks, queryHash });
  let rest;
  try {
    rest = await page(await currentHash());
  } catch (e) {
    if (!(e instanceof StaleQueryHash)) throw e;
    onRecovering?.();
    rest = await page(await discoverHash()); // a second failure surfaces as spotify_changed
  }
  playlist.tracks = [...playlist.tracks, ...rest.tracks].slice(0, maxTracks);
  playlist.total = Math.max(rest.total, playlist.tracks.length);
  playlist.source = "pathfinder";
  return playlist;
}

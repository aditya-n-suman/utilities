// Tier 1: the public embed page. Its Next.js __NEXT_DATA__ blob has playlist metadata, the first 100
// tracks and an anonymous access token that tier 2 reuses for paging.
import { PlaylistUnavailable, SourceChanged } from "../errors";
import { http } from "../http";
import type { Playlist, Track } from "../types";

export const EMBED_TRACK_CAP = 100;
const NEXT_DATA_RE = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

export interface EmbedResult {
  playlist: Playlist;
  accessToken: string | null;
  /** The embed shows at most 100 tracks; there may be more. */
  maybeTruncated: boolean;
}

type Img = { url: string; width?: number | null };
export const largestImage = (sources?: Img[] | null) =>
  sources?.length ? sources.reduce((a, b) => ((b.width ?? 0) > (a.width ?? 0) ? b : a)).url : null;

export function parseEmbedHtml(html: string, playlistId?: string): EmbedResult {
  const m = html.match(NEXT_DATA_RE);
  if (!m) throw new SourceChanged("Embed page has no __NEXT_DATA__ block.");
  const data = JSON.parse(m[1]!);
  const state = data?.props?.pageProps?.state ?? {};
  const entity = state?.data?.entity;
  if (!entity) throw new PlaylistUnavailable();
  if (entity.type !== "playlist") throw new PlaylistUnavailable("Link is not a playlist.");

  const tracks: Track[] = (entity.trackList ?? [])
    .filter((t: any) => (t.entityType ?? "track") === "track" && t.title)
    .map((t: any) => ({
      title: t.title,
      // The embed only exposes a display string; split on the separator Spotify uses.
      artists: String(t.subtitle ?? "").split(", ").filter(Boolean),
      duration_ms: t.duration ?? null,
      explicit: Boolean(t.isExplicit),
      spotify_uri: t.uri ?? null,
    }));

  return {
    playlist: {
      id: playlistId ?? entity.id ?? null,
      name: entity.name || entity.title || "Spotify playlist",
      owner: entity.subtitle ?? null,
      cover_url: largestImage(entity.coverArt?.sources),
      total: tracks.length,
      source: "embed",
      tracks,
    },
    accessToken: state?.settings?.session?.accessToken ?? null,
    maybeTruncated: tracks.length >= EMBED_TRACK_CAP,
  };
}

export async function fetchEmbed(playlistId: string): Promise<EmbedResult> {
  const resp = await http(`https://open.spotify.com/embed/playlist/${playlistId}`, { credentials: "omit" });
  if (resp.status === 400 || resp.status === 404) throw new PlaylistUnavailable();
  if (!resp.ok) throw new SourceChanged(`Embed page returned ${resp.status}.`);
  return parseEmbedHtml(await resp.text(), playlistId);
}

// Ported from apps/spotify-to-youtube/backend/tests/test_sources.py (same fixtures).
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidPlaylistLink, PlaylistUnavailable, SourceChanged, StaleQueryHash } from "@/engine/errors";
import { parseEmbedHtml } from "@/engine/sources/embed";
import { fetchPlaylist } from "@/engine/sources";
import { parsePage } from "@/engine/sources/pathfinder";
import { DEFAULT_HASH, extractBundleUrl, extractHash } from "@/engine/sources/queryHash";
import { isShortLink, parsePlaylistId } from "@/engine/sources/resolve";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const PID = "37i9dQZF1DXcBWIGoYBM5M";

describe("parsePlaylistId", () => {
  it.each([
    `https://open.spotify.com/playlist/${PID}`,
    `https://open.spotify.com/playlist/${PID}?si=abc123&pi=x`,
    `open.spotify.com/playlist/${PID}`,
    `https://open.spotify.com/intl-de/playlist/${PID}`,
    `https://open.spotify.com/intl-pt-br/playlist/${PID}`,
    `https://open.spotify.com/embed/playlist/${PID}`,
    `spotify:playlist:${PID}`,
    PID,
    `  https://open.spotify.com/playlist/${PID}/  `,
  ])("parses %s", (link) => expect(parsePlaylistId(link)).toBe(PID));

  it("leaves short links for network resolution", () => {
    expect(parsePlaylistId("https://spotify.link/AbCdEf")).toBeNull();
    expect(isShortLink("spoti.fi/xyz")).toBe(true);
    expect(isShortLink(`https://open.spotify.com/playlist/${PID}`)).toBe(false);
  });

  it.each(["https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX", "https://youtube.com/playlist?list=x", "hello"])(
    "rejects %s",
    (link) => expect(() => parsePlaylistId(link)).toThrow(InvalidPlaylistLink),
  );
});

describe("embed page", () => {
  it("parses the fixture", () => {
    const { playlist, accessToken, maybeTruncated } = parseEmbedHtml(fixture("embed_playlist.html"), PID);
    expect(playlist.name).toBe("Today’s Top Hits");
    expect(playlist.owner).toBe("Spotify");
    expect(playlist.source).toBe("embed");
    expect(playlist.tracks).toHaveLength(50);
    expect(playlist.total).toBe(50);
    const first = playlist.tracks[0]!;
    expect(first.title).toBe("Patient Zero");
    expect(first.artists).toEqual(["Taylor Swift"]);
    expect(first.duration_ms).toBe(225868);
    expect(first.spotify_uri).toMatch(/^spotify:track:/);
    expect(playlist.cover_url).toMatch(/^https:\/\//);
    expect(accessToken).toBe("REDACTED_TEST_TOKEN");
    expect(maybeTruncated).toBe(false);
  });

  it("treats a page without entity as unavailable", () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"status":500}}}</script>';
    expect(() => parseEmbedHtml(html)).toThrow(PlaylistUnavailable);
  });

  it("treats a page without __NEXT_DATA__ as a source change", () => {
    expect(() => parseEmbedHtml("<html></html>")).toThrow(SourceChanged);
  });
});

describe("pathfinder page", () => {
  it("parses the fixture", () => {
    const { tracks, total, playlist } = parsePage(JSON.parse(fixture("pathfinder_fetchPlaylist.json")));
    expect(total).toBe(150);
    expect(playlist.name).toBe("All Out 80s");
    expect(tracks).toHaveLength(5);
    const t = tracks[0]!;
    expect([t.title, t.artists, t.album]).toEqual(["La Isla Bonita", ["Madonna"], "True Blue"]);
    expect(t.duration_ms).toBe(242733);
    expect(t.cover_url).toMatch(/^https:\/\/i\.scdn\.co\//);
  });

  it("maps errors", () => {
    expect(() => parsePage({ data: { playlistV2: { __typename: "GenericError", message: "Failed to fetch playlist" } } })).toThrow(PlaylistUnavailable);
    expect(() => parsePage({ errors: [{ message: "Invalid query hash" }] })).toThrow(StaleQueryHash);
    expect(() => parsePage({ data: { playlistV2: { __typename: "Playlist" } } })).toThrow(SourceChanged);
  });
});

describe("query hash recovery", () => {
  it("finds the bundle and the hash", () => {
    const html = '<script src="https://open.spotifycdn.com/cdn/build/web-player/web-player.89072873.js"></script>';
    expect(extractBundleUrl(html)).toBe("https://open.spotifycdn.com/cdn/build/web-player/web-player.89072873.js");
    const js = `x=new aQ.l("fetchPlaylist","query","${"a".repeat(64)}",null),fh=new aQ.l("fetchPlaylistMetadata","query","${"b".repeat(64)}",null)`;
    expect(extractHash(js)).toBe("a".repeat(64));
    expect(extractHash("nothing here")).toBeNull();
  });
});

describe("fetchPlaylist (mocked network)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** An embed page with exactly 100 tracks so paging kicks in. */
  function embedWith100() {
    const trackList = Array.from({ length: 100 }, (_, i) => ({ title: `Song ${i}`, subtitle: "Artist", duration: 200000, uri: `spotify:track:${i}` }));
    const data = { props: { pageProps: { state: { data: { entity: { type: "playlist", name: "Big", subtitle: "me", trackList } }, settings: { session: { accessToken: "tok" } } } } } };
    return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
  }
  const page = (n: number, total: number) => ({
    data: { playlistV2: { __typename: "Playlist", name: "Big", content: { totalCount: total, items: Array.from({ length: n }, (_, i) => ({ itemV2: { data: { __typename: "Track", name: `Extra ${i}`, artists: { items: [{ profile: { name: "Artist" } }] } } } })) } } },
  });

  it("pages past 100 tracks and recovers once from a stale hash", async () => {
    const newHash = "c".repeat(64);
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes("/embed/playlist/")) return new Response(embedWith100());
      if (url.includes("pathfinder")) {
        const hash = JSON.parse(String(init?.body)).extensions.persistedQuery.sha256Hash;
        if (hash === DEFAULT_HASH) return new Response('"Invalid query hash"', { status: 412 });
        return new Response(JSON.stringify(page(30, 130)));
      }
      if (url === "https://open.spotify.com/") return new Response('<script src="https://open.spotifycdn.com/cdn/build/web-player/web-player.abc123.js">');
      if (url.includes("web-player.abc123.js")) return new Response(`"fetchPlaylist","query","${newHash}"`);
      throw new Error(`unexpected ${url}`);
    });
    const events: string[] = [];
    const playlist = await fetchPlaylist(`https://open.spotify.com/playlist/${PID}`, {
      onMetadata: (_p, more) => events.push(`metadata:${more}`),
      onRecovering: () => events.push("recovering"),
    });
    expect(events).toEqual(["metadata:true", "recovering"]);
    expect(playlist.tracks).toHaveLength(130);
    expect(playlist.total).toBe(130);
    expect(playlist.source).toBe("pathfinder");
    expect(calls.filter((c) => c.includes("pathfinder"))).toHaveLength(2);
  });

  it("caps at maxTracks without paging", async () => {
    vi.stubGlobal("fetch", async () => new Response(embedWith100()));
    const playlist = await fetchPlaylist(PID, { maxTracks: 40 });
    expect(playlist.tracks).toHaveLength(40);
  });

  it("maps a missing playlist to playlist_unavailable", async () => {
    vi.stubGlobal("fetch", async () => new Response('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>'));
    await expect(fetchPlaylist(PID)).rejects.toMatchObject({ code: "playlist_unavailable" });
  });

  it("maps network failure to spotify_unreachable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchPlaylist(PID)).rejects.toMatchObject({ code: "spotify_unreachable" });
  });
});

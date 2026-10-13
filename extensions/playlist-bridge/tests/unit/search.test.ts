import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cacheKey } from "@/engine/cache";
import type { Candidate, Track } from "@/engine/types";
import { parseYoutubeSearch, parseYtmItem, parseYtmSearch, ytmToCandidates } from "@/engine/youtube/innertube";
import { Searcher, SearchFailed, type MatchCache, type SearchBackend } from "@/engine/youtube/search";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("YouTube Music parser", () => {
  it("matches ytmusicapi on a recorded videos response", () => {
    const ours = parseYtmSearch(fixture("ytmusic_search_videos.json"), "videos");
    const theirs = fixture("ytmusic_search_videos.parsed.json");
    expect(ours.map((r) => [r.videoId, r.title, r.artists, r.duration_seconds])).toEqual(
      theirs.map((r: any) => [r.videoId, r.title, r.artists.map((a: any) => a.name), r.duration_seconds]),
    );
    expect(ytmToCandidates(ours)[0]).toMatchObject({ source: "ytmusic_video", video_id: "djV11Xbc914", channel: "a-ha", duration_s: 244 });
  });

  it("returns nothing for a 'No results' response", () => {
    expect(parseYtmSearch(fixture("ytmusic_search_songs.json"), "songs")).toEqual([]);
  });

  it("parses a song row (type label, linked artists, album, duration, explicit badge)", () => {
    const run = (text: string, browseId?: string) => (browseId ? { text, navigationEndpoint: { browseEndpoint: { browseId } } } : { text });
    const item = {
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [run("Take On Me")] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [run("Song"), run(" • "), run("a-ha", "UC123"), run(" • "), run("Hunting High and Low", "MPREb_abc"), run(" • "), run("3:46")] } } },
      ],
      overlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: { playNavigationEndpoint: { watchEndpoint: { videoId: "2WPCLda_erI" } } } } } },
      badges: [{ musicInlineBadgeRenderer: { accessibilityData: { accessibilityData: { label: "Explicit" } } } }],
    };
    expect(parseYtmItem(item, "song")).toEqual({
      resultType: "song", videoId: "2WPCLda_erI", title: "Take On Me", artists: ["a-ha"], duration_seconds: 226, isExplicit: true,
    });
  });
});

describe("youtube.com parser", () => {
  it("reads videoRenderer results", () => {
    const results = parseYoutubeSearch(fixture("youtube_search.json"));
    expect(results.length).toBeGreaterThan(10);
    for (const r of results) {
      expect(r.video_id).toMatch(/^[\w-]{11}$/);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.source).toBe("ytdlp");
    }
    expect(results.filter((r) => r.duration_s && r.channel).length).toBeGreaterThan(10);
  });
});

describe("cache key", () => {
  it("matches the web app's cache.py", () => {
    const t = (title: string, artists: string[], duration_ms: number | null): Track => ({ title, artists, duration_ms, explicit: false });
    expect(cacheKey(t("Take On Me - 2015 Remaster", ["a-ha"], 226000))).toBe("a ha|take on me|45");
    expect(cacheKey(t("Sweet Dreams (feat. X)", ["Eurythmics", "Annie Lennox"], null))).toBe("annie lennox eurythmics|sweet dreams|-");
    expect(cacheKey(t("Beyoncé", ["Rosalía"], 181499))).toBe("rosalia|beyonce|36");
    expect(cacheKey(t("X", ["Y"], 182500))).toBe("y|x|36"); // Python rounds 36.5 to even
  });
});

// Ported from apps/spotify-to-youtube/backend/tests/test_search.py
const TRACK: Track = { title: "Take On Me", artists: ["a-ha"], duration_ms: 225_000, explicit: false };
const c = (video_id: string, title: string, channel: string, duration_s: number, source: string): Candidate => ({
  video_id, title, channel, duration_s, source, score: 0, thumbnail: "", url: "",
});

function fake({ songs = [], videos = [], plain = [], fail = [] as string[] }: { songs?: Candidate[]; videos?: Candidate[]; plain?: Candidate[]; fail?: string[] } = {}) {
  const calls: string[] = [];
  const backend: SearchBackend = {
    async ytm(_q, kind) {
      calls.push(kind);
      if (fail.includes(kind)) throw new Error("boom");
      return kind === "songs" ? songs : videos;
    },
    async youtube() {
      calls.push("plain");
      if (fail.includes("plain")) throw new Error("boom");
      return plain;
    },
  };
  return { calls, backend };
}

describe("Searcher layers", () => {
  it("stops after a good song result", async () => {
    const f = fake({ songs: [c("song", "Take On Me", "a-ha", 225, "ytmusic_song")] });
    const ranked = await new Searcher(null, f.backend, 0).find(TRACK);
    expect(ranked[0]!.video_id).toBe("song");
    expect(f.calls).toEqual(["songs"]);
  });

  it("falls through layers when songs are empty", async () => {
    const f = fake({
      videos: [c("weak", "Take On Me (Karaoke)", "Sing King", 230, "ytmusic_video")],
      plain: [c("yt", "a-ha - Take On Me (Official Video)", "a-ha", 226, "ytdlp")],
    });
    const ranked = await new Searcher(null, f.backend, 0).find(TRACK);
    expect(f.calls).toEqual(["songs", "videos", "plain"]);
    expect(ranked[0]!.video_id).toBe("yt");
  });

  it("tolerates layer errors but raises when everything fails", async () => {
    const ok = fake({ plain: [c("yt", "a-ha - Take On Me", "a-ha", 226, "ytdlp")], fail: ["songs", "videos"] });
    expect((await new Searcher(null, ok.backend, 0).find(TRACK))[0]!.video_id).toBe("yt");
    await expect(new Searcher(null, fake({ fail: ["songs", "videos", "plain"] }).backend, 0).find(TRACK)).rejects.toBeInstanceOf(SearchFailed);
  });

  it("returns empty (not an error) when nothing is found", async () => {
    expect(await new Searcher(null, fake().backend, 0).find(TRACK)).toEqual([]);
  });

  it("skips a dead songs catalog after three empty results", async () => {
    const f = fake({ videos: [c("v", "Take On Me", "a-ha", 225, "ytmusic_video")] });
    const s = new Searcher(null, f.backend, 0);
    for (let i = 0; i < 3; i++) await s.find(TRACK);
    f.calls.length = 0;
    await s.find(TRACK);
    expect(f.calls).not.toContain("songs");
  });

  it("uses the cache", async () => {
    const store = new Map<string, Candidate[]>();
    const cache: MatchCache = { get: async (t) => store.get(cacheKey(t)) ?? null, put: async (t, v) => void store.set(cacheKey(t), v) };
    const f = fake({ songs: [c("song", "Take On Me", "a-ha", 225, "ytmusic_song")] });
    const s = new Searcher(cache, f.backend, 0);
    await s.find(TRACK);
    f.calls.length = 0;
    const again = await s.find({ ...TRACK, title: "Take On Me - 2015 Remaster", duration_ms: 226_000 });
    expect(again[0]!.video_id).toBe("song");
    expect(f.calls).toEqual([]);
  });
});

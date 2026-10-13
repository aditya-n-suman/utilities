import { afterEach, describe, expect, it, vi } from "vitest";
import { savePlaylist, type SaveState } from "@/engine/youtube/save";
import { getSession, NotSignedIn, parseAccountMenu, sapisidHash } from "@/engine/youtube/session";

const cookie = async () => "AbCdEf123/XyZ";
const noCookie = async () => null;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `vid${String(i).padStart(8, "0")}`);

afterEach(() => vi.unstubAllGlobals());

describe("YouTube session", () => {
  it("builds the same SAPISIDHASH as ytmusicapi", async () => {
    expect(await sapisidHash("AbCdEf123/XyZ", 1760000000)).toBe("SAPISIDHASH 1760000000_1e5e0ffbc261bc43943fe24f5e8e33805c4da6a7");
  });

  it("parses the account menu", () => {
    const response = {
      actions: [{ openPopupAction: { popup: { multiPageMenuRenderer: { header: { activeAccountHeaderRenderer: {
        accountName: { runs: [{ text: "Mara Kessler" }] },
        channelHandle: { runs: [{ text: "@marakessler" }] },
        accountPhoto: { thumbnails: [{ url: "https://yt3.ggpht.com/a=s48", width: 48 }, { url: "https://yt3.ggpht.com/a=s88", width: 88 }] },
      } } } } } }],
    };
    expect(parseAccountMenu(response)).toEqual({ signed_in: true, name: "Mara Kessler", handle: "@marakessler", avatar_url: "https://yt3.ggpht.com/a=s88" });
    expect(parseAccountMenu({ actions: [] })).toEqual({ signed_in: false });
  });

  it("is signed out without the cookie, and sends auth headers with it", async () => {
    expect(await getSession(noCookie)).toEqual({ signed_in: false });
    let seen: RequestInit | undefined;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({}));
    });
    await getSession(cookie);
    const headers = seen!.headers as Record<string, string>;
    expect(seen!.credentials).toBe("include");
    expect(headers.Authorization).toMatch(/^SAPISIDHASH \d+_[0-9a-f]{40}$/);
    expect(headers["X-Origin"]).toBe("https://music.youtube.com");
  });
});

describe("savePlaylist", () => {
  function mockYouTube({ failBatch }: { failBatch?: number } = {}) {
    const calls: { endpoint: string; body: any }[] = [];
    let batch = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const endpoint = url.split("/youtubei/v1/")[1]!.split("?")[0]!;
      const body = JSON.parse(String(init.body));
      calls.push({ endpoint, body });
      if (endpoint === "playlist/create") return new Response(JSON.stringify({ playlistId: "PLtest" }));
      batch++;
      if (batch === failBatch) return new Response(JSON.stringify({ status: "STATUS_FAILED" }));
      return new Response(JSON.stringify({ status: "STATUS_SUCCEEDED" }));
    });
    return calls;
  }

  it("creates with the first 50, adds the rest in batches and reports progress", async () => {
    const calls = mockYouTube();
    const progress: number[] = [];
    const state: SaveState = { playlistId: null, added: 0 };
    const result = await savePlaylist(ids(120), { title: "All <Out> 80s", privacy: "unlisted" }, state, (p) => progress.push(p.added), cookie);
    expect(result).toEqual({
      playlist_id: "PLtest",
      urls: { youtube: "https://www.youtube.com/playlist?list=PLtest", youtube_music: "https://music.youtube.com/playlist?list=PLtest" },
      video_count: 120,
    });
    expect(calls.map((c) => c.endpoint)).toEqual(["playlist/create", "browse/edit_playlist", "browse/edit_playlist"]);
    expect(calls[0]!.body).toMatchObject({ title: "All Out 80s", privacyStatus: "UNLISTED" });
    expect(calls[0]!.body.videoIds).toHaveLength(50);
    expect(calls[1]!.body.actions[0]).toEqual({ action: "ACTION_ADD_VIDEO", addedVideoId: "vid00000050", dedupeOption: "DEDUPE_OPTION_SKIP" });
    expect(calls[2]!.body.actions).toHaveLength(20);
    expect(progress).toEqual([0, 50, 100, 120]);
  });

  it("returns a partial save when a later batch fails, and 'Add the rest' continues it", async () => {
    mockYouTube({ failBatch: 1 });
    const state: SaveState = { playlistId: null, added: 0 };
    const partial = await savePlaylist(ids(120), { title: "x", privacy: "private" }, state, () => {}, cookie);
    expect(partial).toMatchObject({ playlist_id: "PLtest", added: 50, failed: 70 });

    const calls = mockYouTube();
    const done = await savePlaylist(ids(120), { title: "x", privacy: "private" }, state, () => {}, cookie);
    expect(done).toMatchObject({ playlist_id: "PLtest", video_count: 120 });
    expect(calls.map((c) => c.endpoint)).toEqual(["browse/edit_playlist", "browse/edit_playlist"]); // no second playlist
  });

  it("asks to sign in when there is no YouTube session", async () => {
    await expect(savePlaylist(ids(3), { title: "x", privacy: "private" }, { playlistId: null, added: 0 }, () => {}, noCookie)).rejects.toBeInstanceOf(NotSignedIn);
  });

  it("treats 401 as an expired sign-in", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    await expect(savePlaylist(ids(3), { title: "x", privacy: "private" }, { playlistId: null, added: 0 }, () => {}, cookie)).rejects.toMatchObject({ code: "not_signed_in" });
  });
});

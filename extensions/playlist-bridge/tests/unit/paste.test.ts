// Ported from apps/spotify-to-youtube/backend/tests/test_paste.py.
import { describe, expect, it } from "vitest";
import { parseCsvRows, parseTrackText } from "@/engine/sources/paste";

describe("pasted lists", () => {
  it("handles dash lines, numbering and durations", () => {
    const pl = parseTrackText("1. a-ha - Take On Me (3:45)\n2) Queen – Bohemian Rhapsody\n\n# comment\nToto - Africa 4:55");
    expect(pl.source).toBe("paste");
    expect(pl.total).toBe(3);
    expect(pl.tracks.map((t) => [t.artists, t.title])).toEqual([
      [["a-ha"], "Take On Me"],
      [["Queen"], "Bohemian Rhapsody"],
      [["Toto"], "Africa"],
    ]);
    expect(pl.tracks[0]!.duration_ms).toBe(225_000);
    expect(pl.tracks[2]!.duration_ms).toBe(295_000);
  });

  it("handles 'by' lines and bare titles", () => {
    const pl = parseTrackText("Fast Car by Tracy Chapman\nSmalltown Boy");
    expect(pl.tracks[0]).toMatchObject({ artists: ["Tracy Chapman"], title: "Fast Car" });
    expect(pl.tracks[1]).toMatchObject({ artists: [], title: "Smalltown Boy" });
  });

  it("splits multiple artists", () => {
    expect(parseTrackText("Eurythmics, Annie Lennox & Dave Stewart - Sweet Dreams").tracks[0]!.artists).toEqual([
      "Eurythmics", "Annie Lennox", "Dave Stewart",
    ]);
  });
});

describe("CSV", () => {
  it("reads an Exportify export", () => {
    const csv =
      '"Track URI","Track Name","Artist Name(s)","Album Name","Duration (ms)"\n' +
      '"spotify:track:1","Take on Me","a-ha","Hunting High and Low","225280"\n' +
      '"spotify:track:2","Sweet Dreams","Eurythmics,Annie Lennox","Sweet Dreams","216933"\n';
    const pl = parseTrackText(csv);
    expect(pl.total).toBe(2);
    expect(pl.tracks[1]).toMatchObject({ artists: ["Eurythmics", "Annie Lennox"], album: "Sweet Dreams", duration_ms: 216933 });
    expect(pl.tracks[0]!.spotify_uri).toBe("spotify:track:1");
  });

  it("reads a simple CSV with m:ss durations", () => {
    const pl = parseTrackText("title,artist,duration\nAfrica,Toto,4:55\n");
    expect(pl.tracks[0]).toMatchObject({ title: "Africa", duration_ms: 295_000 });
  });

  it("detects semicolons and tabs, and handles quotes", () => {
    expect(parseTrackText("title;artist\nAfrica;Toto").tracks[0]).toMatchObject({ title: "Africa", artists: ["Toto"] });
    expect(parseTrackText("title\tartist\nAfrica\tToto").tracks[0]).toMatchObject({ title: "Africa", artists: ["Toto"] });
    expect(parseCsvRows('a,"b, ""quoted""",c\r\n1,2,3', ",")).toEqual([["a", 'b, "quoted"', "c"], ["1", "2", "3"]]);
  });
});

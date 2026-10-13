// Behaviour tests ported from apps/spotify-to-youtube/backend/tests/test_matcher.py.
import { describe, expect, it } from "vitest";
import type { Candidate, Track } from "@/engine/types";
import { confidenceFor, rank, score, searchQuery } from "@/engine/youtube/matcher";

const cand = (video_id: string, title: string, channel: string, duration_s: number, source = "ytmusic_video"): Candidate => ({
  video_id, title, channel, duration_s, source, score: 0, thumbnail: "", url: "",
});
const TRACK: Track = { title: "Bohemian Rhapsody - Remastered 2011", artists: ["Queen"], duration_ms: 354_000, explicit: false };

describe("matcher behaviour", () => {
  it("uses the first two artists in the query", () => {
    expect(searchQuery({ title: "Sweet Dreams - 2005 Remaster", artists: ["Eurythmics", "Annie Lennox", "Dave Stewart"], explicit: false }))
      .toBe("Eurythmics Annie Lennox Sweet Dreams");
  });

  it("prefers official over live, cover and lyrics", () => {
    const order = rank(TRACK, [
      cand("live", "Queen - Bohemian Rhapsody (Live Aid 1985)", "Queen Official", 165),
      cand("cover", "Bohemian Rhapsody (Cover)", "Some Choir", 352),
      cand("lyrics", "Queen - Bohemian Rhapsody (Lyrics)", "7clouds Rock", 355),
      cand("official", "Queen – Bohemian Rhapsody (Official Video Remastered)", "Queen Official", 360),
      cand("topic", "Bohemian Rhapsody", "Queen - Topic", 355, "ytmusic_song"),
    ]).map((c) => c.video_id);
    expect(order[0]).toBe("topic");
    expect(order.indexOf("official")).toBeLessThan(order.indexOf("lyrics"));
    expect(order.indexOf("lyrics")).toBeLessThan(order.indexOf("cover"));
    expect(order.indexOf("lyrics")).toBeLessThan(order.indexOf("live"));
  });

  it("accepts live when the source is live", () => {
    const live: Track = { title: "Bohemian Rhapsody - Live Aid", artists: ["Queen"], duration_ms: 165_000, explicit: false };
    const order = rank(live, [
      cand("studio", "Bohemian Rhapsody", "Queen - Topic", 355, "ytmusic_song"),
      cand("live", "Queen - Bohemian Rhapsody (Live Aid 1985)", "Queen Official", 165),
    ]);
    expect(order[0]!.video_id).toBe("live");
  });

  it("scores the wrong song as not found", () => {
    expect(confidenceFor(score(TRACK, cand("x", "Never Gonna Give You Up", "Rick Astley", 213)))).toBe("none");
  });

  it("doesn't call a right-title, wrong-artist upload high", () => {
    const t: Track = { title: "Take On Me", artists: ["a-ha"], duration_ms: 225_000, explicit: false };
    expect(confidenceFor(score(t, cand("x", "Take On Me", "Sing King", 230)))).not.toBe("high");
    expect(["low", "none"]).toContain(confidenceFor(score(t, cand("y", "Take On Me (Karaoke)", "Sing King", 230))));
  });

  it("dedupes and uses duration to break ties", () => {
    expect(rank(TRACK, Array(3).fill(cand("a", "Bohemian Rhapsody", "Queen", 355)))).toHaveLength(1);
    expect(rank(TRACK, [cand("long", "Bohemian Rhapsody", "Queen", 600), cand("ok", "Bohemian Rhapsody", "Queen", 356)])[0]!.video_id).toBe("ok");
  });
});

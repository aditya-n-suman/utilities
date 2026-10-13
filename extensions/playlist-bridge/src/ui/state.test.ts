import { describe, expect, it } from "vitest";
import type { Match } from "./api";
import {
  confidenceFor, durationDiff, emptyCounts, fmtDuration, initialJob, isSettled, jobReducer,
  looksLikePlaylistLink, matchesFilter, needsReview,
} from "./state";

const match = (over: Partial<Match> = {}): Match => ({
  index: 0, status: "pending", confidence: null, chosen: null, alternatives: [], error: null, picked: false,
  track: { title: "Take On Me", artists: ["a-ha"], explicit: false, duration_ms: 225_000 },
  ...over,
});

describe("jobReducer", () => {
  it("moves from fetching to matching when the playlist arrives", () => {
    let s = jobReducer(initialJob, { type: "started", jobId: "j1" });
    expect(s.screen).toBe("fetching");
    s = jobReducer(s, { type: "fetching", playlist: { name: "Mix", total: 150, track_count: null, source: "embed" }, loadingMore: true });
    expect(s.loadingMore).toBe(true);
    s = jobReducer(s, { type: "playlist", playlist: { name: "Mix", total: 2, track_count: 2, source: "embed" }, matches: [match(), match({ index: 1 })] });
    expect(s.screen).toBe("matching");
    expect(s.counts.total).toBe(2);
    expect(s.loadingMore).toBe(false);
  });

  it("is settled only when the first pass finished and nothing is pending", () => {
    let s = jobReducer(initialJob, { type: "started", jobId: "j1" });
    s = jobReducer(s, { type: "playlist", playlist: { name: "Mix", total: 1, track_count: 1, source: "embed" }, matches: [match()] });
    const done = { ...emptyCounts, total: 1, done: 1, high: 1 };
    s = jobReducer(s, { type: "match", match: match({ status: "matched", confidence: "high" }), counts: done });
    expect(isSettled(s)).toBe(false);
    s = jobReducer(s, { type: "done", counts: done });
    expect(isSettled(s)).toBe(true);
    // A retry puts the track back to pending.
    s = jobReducer(s, { type: "match", match: match(), counts: { ...emptyCounts, total: 1 } });
    expect(isSettled(s)).toBe(false);
  });

  it("ignores updates for unknown rows", () => {
    const s = jobReducer(initialJob, { type: "match", match: match({ index: 9 }), counts: emptyCounts });
    expect(s).toBe(initialJob);
  });
});

describe("review filters", () => {
  it("flags errors and unconfident matches unless the user picked them", () => {
    expect(needsReview(match({ status: "error" }))).toBe(true);
    expect(needsReview(match({ status: "matched", confidence: "medium" }))).toBe(true);
    expect(needsReview(match({ status: "matched", confidence: "medium", picked: true }))).toBe(false);
    expect(needsReview(match({ status: "matched", confidence: "high" }))).toBe(false);
    expect(matchesFilter(match({ status: "not_found" }), "notfound")).toBe(true);
    expect(matchesFilter(match({ status: "removed" }), "all")).toBe(true);
  });
});

describe("helpers", () => {
  it("formats durations and diffs", () => {
    expect(fmtDuration(225.4)).toBe("3:45");
    expect(durationDiff(225_000, 228)).toBe(3);
    expect(durationDiff(null, 228)).toBeNull();
  });

  it("maps scores like the backend", () => {
    expect([0.9, 0.7, 0.5, 0.1].map(confidenceFor)).toEqual(["high", "medium", "low", "none"]);
  });

  it("recognises playlist links", () => {
    for (const ok of [
      "https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe?si=x",
      "open.spotify.com/intl-de/playlist/37i9dQZF1DX4UtSsGT1Sbe",
      "spotify:playlist:37i9dQZF1DX4UtSsGT1Sbe",
      "https://spotify.link/AbCd",
    ]) expect(looksLikePlaylistLink(ok)).toBe(true);
    for (const bad of ["spotify.com/artist/4Z8W4fKeB5", "https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX", "hello"])
      expect(looksLikePlaylistLink(bad)).toBe(false);
  });
});

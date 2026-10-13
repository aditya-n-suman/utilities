// Parity with the Python matcher (apps/spotify-to-youtube/backend/app/youtube/matcher.py).
// Expectations come from tests/golden/gen_golden.py, which runs the Python code on real YouTube results.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partialRatio, ratio, tokenSetRatio, tokenSortRatio } from "@/engine/youtube/fuzz";
import { cleanTitle, normalize, rank, rawScore, score, searchQuery } from "@/engine/youtube/matcher";
import type { Candidate, Track } from "@/engine/types";

const golden = JSON.parse(readFileSync(new URL("../golden/golden.json", import.meta.url), "utf8"));
const asCandidate = (c: any): Candidate => ({ ...c, thumbnail: "", url: "" });

describe("fuzz parity with rapidfuzz", () => {
  it.each(golden.string_pairs as any[])("$a vs $b", (p: any) => {
    const { a, b } = p;
    expect(ratio(a, b)).toBeCloseTo(p.ratio, 10);
    expect(partialRatio(a, b)).toBeCloseTo(p.partial_ratio, 10);
    expect(tokenSortRatio(a, b)).toBeCloseTo(p.token_sort_ratio, 10);
    expect(tokenSetRatio(a, b)).toBeCloseTo(p.token_set_ratio, 10);
  });

  it("matches every artist-vs-candidate partial_ratio from real results", () => {
    const mismatches = golden.cases
      .flatMap((c: any) => c.artist_pairs)
      .filter((p: any) => Math.abs(partialRatio(p.a, p.b) - p.partial_ratio) > 1e-9)
      .map((p: any) => ({ ...p, ts: partialRatio(p.a, p.b) }));
    expect(mismatches).toEqual([]);
  });
});

describe("text helpers parity", () => {
  it("normalize", () => {
    expect(golden.normalize.map((n: any) => normalize(n.in))).toEqual(golden.normalize.map((n: any) => n.out));
  });
  it("cleanTitle", () => {
    expect(golden.clean_title.map((n: any) => cleanTitle(n.in))).toEqual(golden.clean_title.map((n: any) => n.out));
  });
});

describe("matcher parity on real YouTube candidates", () => {
  it("search queries", () => {
    for (const c of golden.cases) expect(searchQuery(c.track as Track)).toBe(c.search_query);
  });

  it("raw scores, displayed scores and ranking order", () => {
    const problems: string[] = [];
    for (const c of golden.cases) {
      const track = c.track as Track;
      const cands = c.candidates.map(asCandidate);
      cands.forEach((cand: Candidate, i: number) => {
        const raw = rawScore(track, cand);
        if (Math.abs(raw - c.raw_scores[i]) > 1e-12) problems.push(`raw ${track.title} / ${cand.title}: ts=${raw} py=${c.raw_scores[i]}`);
        if (score(track, cand) !== c.scores[i]) problems.push(`score ${track.title} / ${cand.title}: ts=${score(track, cand)} py=${c.scores[i]}`);
      });
      const order = rank(track, cands).map((x) => x.video_id);
      if (JSON.stringify(order) !== JSON.stringify(c.rank)) problems.push(`rank ${track.title}`);
    }
    expect(problems).toEqual([]);
  });
});

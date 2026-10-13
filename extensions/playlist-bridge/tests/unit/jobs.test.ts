// Job runner flows, ported from apps/spotify-to-youtube/backend/tests/test_api.py.
import { describe, expect, it } from "vitest";
import { JobManager, type JobSnapshot, type JobStore } from "@/engine/jobs";
import { reportCsv, tempLinks } from "@/engine/report";
import type { Candidate, JobEvent, Track } from "@/engine/types";
import { Searcher, SearchFailed } from "@/engine/youtube/search";

class FakeSearcher extends Searcher {
  failing = false;
  constructor() {
    super(null);
  }
  override async find(track: Track): Promise<Candidate[]> {
    if (this.failing) throw new SearchFailed("down");
    if (track.title === "Unknown Song") return [];
    return [{ video_id: `v_${track.title.slice(0, 3)}`, title: track.title, channel: track.artists.join(", "), duration_s: 225, source: "ytmusic_song", score: 0.95, thumbnail: "", url: "" }];
  }
  override async freeText(): Promise<Candidate[]> {
    return [
      { video_id: "s1", title: "Unrelated", channel: "Someone", duration_s: 100, source: "ytdlp", score: 0, thumbnail: "", url: "" },
      { video_id: "s2", title: "Unknown Song", channel: "Nobody", duration_s: null, source: "ytdlp", score: 0, thumbnail: "", url: "" },
    ];
  }
}

class MemoryStore implements JobStore {
  snapshot: JobSnapshot | null = null;
  async save(s: JobSnapshot) {
    this.snapshot = structuredClone(s);
  }
  async load() {
    return this.snapshot;
  }
  async remove() {
    this.snapshot = null;
  }
}

const settle = (job: { events: JobEvent[] }) =>
  new Promise<void>((resolve) => {
    const check = () => (job.events.some((e) => e.type === "done" || e.type === "failed") ? resolve() : setTimeout(check, 5));
    check();
  });

const TEXT = "a-ha - Take On Me\nNobody - Unknown Song";

describe("JobManager", () => {
  it("emits playlist → matches → done and counts outcomes", async () => {
    const jobs = new JobManager(new FakeSearcher());
    const job = jobs.create({ text: TEXT, name: "Test’s List" });
    await settle(job);
    expect(job.events.map((e) => e.type)).toEqual(["playlist", "match", "match", "done"]);
    expect(job.playlistInfo()).toMatchObject({ name: "Test’s List", source: "paste", track_count: 2 });
    expect(job.matches.map((m) => m.status)).toEqual(["matched", "not_found"]);
    expect(job.counts()).toMatchObject({ total: 2, done: 2, high: 1, not_found: 1 });
  });

  it("replays history to late subscribers", async () => {
    const jobs = new JobManager(new FakeSearcher());
    const job = jobs.create({ text: TEXT });
    await settle(job);
    const seen: string[] = [];
    job.subscribe((e) => seen.push(e.type));
    expect(seen).toEqual(["playlist", "match", "match", "done"]);
  });

  it("supports manual search, picking, removing and restoring", async () => {
    const jobs = new JobManager(new FakeSearcher());
    const job = jobs.create({ text: TEXT });
    await settle(job);
    const results = await jobs.searchFor(job, 1, "nobody unknown song");
    expect(results[0]!.video_id).toBe("s2");
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    const picked = jobs.edit(job, 1, "choose", results[0]);
    expect(picked).toMatchObject({ status: "matched", picked: true });
    const first = job.matches[0]!.chosen!;
    const switched = jobs.edit(job, 0, "choose", { ...first, video_id: "zzz", score: 0.9 });
    expect(switched.chosen!.video_id).toBe("zzz");
    expect(switched.alternatives.map((a) => a.video_id)).toContain(first.video_id);
    expect(switched.alternatives.map((a) => a.video_id)).not.toContain("zzz");
    jobs.edit(job, 0, "remove");
    expect(job.videoIds()).toEqual(["s2"]);
    jobs.edit(job, 0, "restore");
    expect(job.videoIds()).toEqual(["zzz", "s2"]);
  });

  it("counts errors separately and retries them", async () => {
    const searcher = new FakeSearcher();
    searcher.failing = true;
    const jobs = new JobManager(searcher);
    const job = jobs.create({ text: TEXT });
    await settle(job);
    expect(job.counts()).toMatchObject({ error: 2, not_found: 0 });
    searcher.failing = false;
    expect(jobs.retryErrors(job)).toBe(2);
    await new Promise((r) => setTimeout(r, 20));
    expect(job.counts()).toMatchObject({ error: 0, high: 1, not_found: 1 });
  });

  it("fails empty input with a clear code", async () => {
    const job = new JobManager(new FakeSearcher()).create({ text: "   \n# just a comment" });
    await settle(job);
    expect(job.events.at(-1)).toMatchObject({ type: "failed", data: { code: "empty" } });
  });

  it("persists a snapshot and resumes it, finishing unfinished searches", async () => {
    const store = new MemoryStore();
    const jobs = new JobManager(new FakeSearcher(), store);
    const job = jobs.create({ text: TEXT, name: "Saved" });
    await settle(job);
    jobs.setStage(job, "review");
    await new Promise((r) => setTimeout(r, 10));
    const snap = store.snapshot!;
    expect(snap).toMatchObject({ stage: "review", saved: false });
    snap.matches[1] = { ...snap.matches[1]!, status: "pending" }; // pretend the tab closed mid-search

    const fresh = new JobManager(new FakeSearcher(), store);
    const resumed = fresh.resume(snap);
    await settle(resumed);
    const types = resumed.events.map((e) => e.type);
    expect(types[0]).toBe("playlist");
    expect(types.at(-1)).toBe("done");
    expect(resumed.events[0]).toMatchObject({ data: { counts: { total: 2, done: 1 } } });
    expect(resumed.matches[1]!.status).toBe("not_found");
  });
});

it("saves user edits immediately (a reload right after an edit keeps it)", async () => {
  const store = new MemoryStore();
  const jobs = new JobManager(new FakeSearcher(), store);
  const job = jobs.create({ text: TEXT });
  await settle(job);
  jobs.edit(job, 0, "remove");
  await Promise.resolve();
  expect(store.snapshot!.matches[0]!.status).toBe("removed");
});

describe("links and report", () => {
  it("chunks temporary links at 50", () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id${String(i).padStart(2, "0")}`);
    const { links, video_count } = tempLinks(ids);
    expect(video_count).toBe(120);
    expect(links.map((l) => [l.part, l.of])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(links[2]!.url.endsWith("id119")).toBe(true);
  });

  it("builds the CSV report with the web app's columns", async () => {
    const jobs = new JobManager(new FakeSearcher());
    const job = jobs.create({ text: 'a-ha - Take On Me\nNobody - Unknown Song, "quoted"', name: "Test’s List" });
    await settle(job);
    jobs.edit(job, 0, "remove");
    const { filename, csv } = reportCsv(job);
    expect(filename).toBe("Test’s List - YouTube matches.csv");
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("#,Title,Artists,Album,Duration (s),Status,Confidence,YouTube title,Channel,YouTube URL,Score");
    expect(lines[1]).toContain("removed");
    expect(lines[2]).toContain('"Unknown Song, ""quoted"""');
  });
});

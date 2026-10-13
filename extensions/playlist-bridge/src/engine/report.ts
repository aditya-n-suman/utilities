import type { Job } from "./jobs";

export const TEMP_LINK_CHUNK = 50;

/** YouTube's anonymous watch_videos playlists (opened by the user, not fetched by us). */
export function tempLinks(videoIds: string[], chunk = TEMP_LINK_CHUNK) {
  const urls: string[] = [];
  for (let i = 0; i < videoIds.length; i += chunk) {
    urls.push(`https://www.youtube.com/watch_videos?video_ids=${videoIds.slice(i, i + chunk).join(",")}`);
  }
  return { links: urls.map((url, i) => ({ part: i + 1, of: urls.length, url })), video_count: videoIds.length };
}

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Same columns as the web app's /report.csv. */
export function reportCsv(job: Job): { filename: string; csv: string } {
  const rows: unknown[][] = [["#", "Title", "Artists", "Album", "Duration (s)", "Status", "Confidence", "YouTube title", "Channel", "YouTube URL", "Score"]];
  for (const m of job.matches) {
    const c = m.status === "matched" ? m.chosen : null;
    rows.push([
      m.index + 1, m.track.title, m.track.artists.join(", "), m.track.album ?? "",
      m.track.duration_ms ? Math.round(m.track.duration_ms / 1000) : "", m.status, m.confidence ?? "",
      c?.title ?? "", c?.channel ?? "", c?.url ?? "", c?.score ?? "",
    ]);
  }
  const name = (job.playlist?.name ?? "playlist").replace(/[\\/:*?"<>|]/g, "");
  return { filename: `${name} - YouTube matches.csv`, csv: "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n" };
}

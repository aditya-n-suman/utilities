// Port of apps/spotify-to-youtube/backend/app/youtube/matcher.py. Keep the two in step:
// tests/golden checks this file against scores produced by the Python version.
import type { Candidate, Confidence, Track } from "../types";
import { hasCombiningClass } from "./combining";
import { partialRatio, ratio, tokenSetRatio, tokenSortRatio } from "./fuzz";

// Python's \w and \b are Unicode-aware; JS's are ASCII-only, so spell them out.
const W = "[\\p{L}\\p{N}_]";
const wordRe = (inner: string, flags = "iu") => new RegExp(`(?<!${W})(?:${inner})(?!${W})`, flags);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Spotify title suffixes that describe the release rather than the recording.
const RELEASE_SUFFIX_RE = new RegExp(
  "\\s+-\\s+(?:" +
    "(?:\\d{4}\\s+)?(?:digital\\s+)?remaster(?:ed)?(?:\\s+\\d{4})?(?:\\s+version)?" +
    "|from\\s+.+" +
    "|(?:single|album|radio|original|mono|stereo|explicit|clean)\\s+(?:version|edit|mix)" +
    "|radio\\s+edit|mono|stereo|bonus\\s+track|deluxe(?:\\s+edition)?|\\d+(?:th|st|nd|rd)\\s+anniversary.*" +
    "|original\\s+(?:motion\\s+picture\\s+)?soundtrack" +
    ")\\s*$",
  "iu",
);
const FEAT_RE = /\s*[(\[]\s*(?:feat\.?|ft\.?|featuring|with|from)\s+[^)\]]*[)\]]/giu;
const BRACKETS_RE = /[(\[][^)\]]*[)\]]/gu;
const NON_WORD_RE = /[^\p{L}\p{N}_\s]/gu;
const WS_RE = /\s+/gu;

// Variant markers: penalise a candidate that has one the source track doesn't.
const VARIANT_WORDS = [
  "live", "cover", "remix", "karaoke", "instrumental", "acoustic", "sped up", "slowed",
  "nightcore", "8d", "reverb", "bass boosted", "tutorial", "reaction", "lesson", "piano version",
  "16d", "chords", "play along", "mashup", "fan made", "loop", "hours", "hour version", "drum cam", "guitar cam",
];
const VARIANT_RES = VARIANT_WORDS.map((w) => wordRe(escape(w)));
// Fine but not first choice: prefer the artist's own upload over lyric channels.
const SOFT_PENALTY_RE = wordRe("lyrics?|lyric video");
const OFFICIAL_RE = wordRe("official (?:audio|video|music video|lyric video|visualizer)|vevo");

export const HIGH = 0.78, MEDIUM = 0.6, LOW = 0.42;

export function normalize(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFKD")) if (!hasCombiningClass(ch.codePointAt(0)!)) out += ch;
  return out.toLowerCase().replaceAll("&", " and ").replace(NON_WORD_RE, " ").replace(WS_RE, " ").trim();
}

/** Drop release noise ("- Remastered 2011", "(feat. X)", "- From 'Film' Soundtrack"). */
export function cleanTitle(title: string): string {
  let t = title.replace(FEAT_RE, "");
  let previous: string | null = null;
  while (previous !== t) {
    previous = t;
    t = t.replace(RELEASE_SUFFIX_RE, "");
  }
  return t.trim();
}

export function searchQuery(track: Track): string {
  return `${track.artists.slice(0, 2).join(" ")} ${cleanTitle(track.title)}`.trim();
}

function channelClean(channel?: string | null): string {
  return (channel ?? "").replace(/\s*-\s*topic$/iu, "").replace(/vevo$/iu, "").trim();
}

/** Video titles are often "Artist - Song (Official Video)"; keep only the song part. */
function titleWithoutArtist(candTitle: string, artists: string[]): string {
  const m = candTitle.match(/\s+[-–—|]\s+/u);
  if (m) {
    const parts = [candTitle.slice(0, m.index), candTitle.slice(m.index! + m[0].length)] as const;
    const [left, right] = parts.map(normalize) as [string, string];
    for (const artist of artists) {
      const a = normalize(artist);
      if (a && partialRatio(a, left) >= 85) return parts[1];
      if (a && partialRatio(a, right) >= 85) return parts[0];
    }
  }
  return candTitle;
}

/** Unclamped score: bonuses can push past 1.0 so they still break ties between good matches. */
export function rawScore(track: Track, cand: Pick<Candidate, "title" | "channel" | "duration_s" | "source">): number {
  const srcTitle = cleanTitle(track.title);
  const candSong = titleWithoutArtist(cand.title, track.artists);
  const normSrc = normalize(srcTitle);
  const normCand = normalize(candSong.replace(BRACKETS_RE, " ")) || normalize(candSong);
  let titleSim = Math.max(tokenSetRatio(normSrc, normCand), ratio(normSrc, normCand)) / 100;
  // Penalise extra words in the candidate (e.g. "Song" vs "Song Part II").
  titleSim = 0.7 * titleSim + (0.3 * tokenSortRatio(normSrc, normCand)) / 100;

  const haystack = normalize(`${channelClean(cand.channel)} ${cand.title}`);
  let artistSim: number;
  const artists = track.artists.filter(Boolean);
  if (track.artists.length) {
    artistSim = Math.max(...artists.map((a) => partialRatio(normalize(a), haystack))) / 100;
    // partial_ratio gives ~0.5 for unrelated strings; rescale so only real overlap counts.
    artistSim = Math.max(0.0, (artistSim - 0.5) / 0.5);
  } else {
    artistSim = 0.5; // pasted titles without artist: neutral
  }

  let durationScore: number;
  if (track.duration_ms && cand.duration_s) {
    const delta = Math.abs(track.duration_ms / 1000 - cand.duration_s);
    durationScore = delta <= 3 ? 1.0 : Math.max(0.0, 1 - (delta - 3) / 30);
  } else {
    durationScore = 0.5;
  }

  let total = 0.45 * titleSim + 0.3 * artistSim + 0.25 * durationScore;

  const sourceText = track.title.toLowerCase();
  for (const rx of VARIANT_RES) if (rx.test(cand.title) && !rx.test(sourceText)) total -= 0.15;
  if (SOFT_PENALTY_RE.test(cand.title) && !SOFT_PENALTY_RE.test(sourceText)) total -= 0.04;
  if (cand.source === "ytmusic_song") total += 0.05;
  if ((cand.channel ?? "").toLowerCase().endsWith("- topic") || OFFICIAL_RE.test(cand.title)) total += 0.04;
  const channel = normalize(channelClean(cand.channel));
  if (channel && artists.some((a) => ratio(channel, normalize(a)) >= 90)) total += 0.08; // the artist's own channel
  return total;
}

/** Python's round(x, 3): round-half-even on the decimal value. */
export function round3(x: number): number {
  const scaled = x * 1000;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const r = Math.abs(diff - 0.5) < 1e-9 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(scaled);
  return r / 1000;
}

const clamp01 = (x: number) => Math.max(0.0, Math.min(1.0, x));

export function score(track: Track, cand: Candidate): number {
  return round3(clamp01(rawScore(track, cand)));
}

export function confidenceFor(value: number): Confidence {
  if (value >= HIGH) return "high";
  if (value >= MEDIUM) return "medium";
  if (value >= LOW) return "low";
  return "none";
}

/** Dedupe by video id, score, and sort best first (by the unclamped score). */
export function rank(track: Track, candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const scored: [number, Candidate][] = [];
  for (const cand of candidates) {
    if (seen.has(cand.video_id)) continue;
    seen.add(cand.video_id);
    const raw = rawScore(track, cand);
    scored.push([raw, { ...cand, score: round3(clamp01(raw)) }]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.map(([, c]) => c);
}

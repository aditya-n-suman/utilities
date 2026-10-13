// Fallback input: a pasted track list or a CSV export (e.g. Exportify). Port of the web app's paste.py.
import type { Playlist, Track } from "../types";

const TITLE_KEYS = ["track name", "track", "title", "song", "name"];
const ARTIST_KEYS = ["artist name(s)", "artist names", "artists", "artist"];
const ALBUM_KEYS = ["album name", "album"];
const DURATION_MS_KEYS = ["duration (ms)", "duration_ms"];
const DURATION_KEYS = ["duration", "length", "time"];
const URI_KEYS = ["track uri", "spotify uri", "uri"];

const LEADING_NUMBER_RE = /^\s*\d+\s*[.)\-:]\s*/;
const DASH_RE = /\s+[-–—]\s+/;
const BY_RE = /^(.+?)\s+by\s+(.+)$/i;

const pick = (row: Record<string, string>, keys: string[]) => {
  for (const k of keys) if (row[k]?.trim()) return row[k]!.trim();
  return null;
};

export function parseDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  const m = v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (m) return ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000;
  return /^\d+$/.test(v) ? Number(v) : null;
}

export const splitArtists = (value: string) =>
  value.split(/\s*[;,]\s*|\s+&\s+|\s+feat\.?\s+/i).map((a) => a.trim()).filter(Boolean);

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF. */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** The delimiter that splits the header into the most columns (outside quotes). */
function sniffDelimiter(header: string): string {
  const counts = [",", ";", "\t"].map((d) => [d, parseCsvRows(header, d)[0]?.length ?? 0] as const);
  return counts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

export function looksLikeCsv(text: string): boolean {
  const header = text.trimStart().split(/\r?\n/)[0]?.toLowerCase() ?? "";
  return /[,;\t]/.test(header) && TITLE_KEYS.some((k) => header.includes(k));
}

export function parseCsv(text: string): Track[] {
  const trimmed = text.trimStart();
  const rows = parseCsvRows(trimmed, sniffDelimiter(trimmed.split(/\r?\n/)[0] ?? ""));
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  const tracks: Track[] = [];
  for (const cells of body) {
    const row = Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ""]));
    const title = pick(row, TITLE_KEYS);
    if (!title) continue;
    const ms = pick(row, DURATION_MS_KEYS);
    tracks.push({
      title,
      artists: splitArtists(pick(row, ARTIST_KEYS) ?? ""),
      album: pick(row, ALBUM_KEYS),
      duration_ms: ms && /^\d+(\.\d+)?$/.test(ms) ? Math.trunc(Number(ms)) : parseDuration(pick(row, DURATION_KEYS)),
      explicit: false,
      spotify_uri: pick(row, URI_KEYS),
    });
  }
  return tracks;
}

export function parseLine(raw: string): Track | null {
  let line = raw.trim().replace(LEADING_NUMBER_RE, "");
  if (!line || line.startsWith("#")) return null;
  let duration_ms: number | null = null;
  const dm = line.match(/[\s(\[]+(\d{1,2}:\d{2})[)\]]?\s*$/);
  if (dm) {
    duration_ms = parseDuration(dm[1]);
    line = line.slice(0, dm.index).trim();
  }
  const dash = line.match(DASH_RE);
  if (dash) {
    const artist = line.slice(0, dash.index);
    const title = line.slice(dash.index! + dash[0].length);
    return { title: title.trim(), artists: splitArtists(artist), duration_ms, explicit: false };
  }
  const by = line.match(BY_RE);
  if (by) return { title: by[1]!.trim(), artists: splitArtists(by[2]!), duration_ms, explicit: false };
  return { title: line, artists: [], duration_ms, explicit: false };
}

/** `Artist - Title` lines (optionally numbered, optional trailing m:ss) or a CSV export. */
export function parseTrackText(text: string, name = "Pasted list"): Playlist {
  const tracks = looksLikeCsv(text)
    ? parseCsv(text)
    : text.split(/\r?\n/).map(parseLine).filter((t): t is Track => t !== null);
  return { name, total: tracks.length, source: "paste", tracks };
}

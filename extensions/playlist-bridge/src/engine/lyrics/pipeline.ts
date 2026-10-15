// Turns a song's lyrics into per-line translations and/or transliterations.
//
// Translation: on-device first (Chrome's Translator API, Google's models, nothing leaves the browser), online when
// the browser has no on-device model for the language, or the lyrics are romanised ("hi-Latn"), which on-device
// models don't handle. Transliteration is online only: browsers have no API for it.
// Online means Google's web endpoints (see google.ts), used only when the user allowed it on the lyrics bar.
//
// Every distinct line is handled on its own. Sending all lyrics in one request loses the line alignment (blank lines
// get dropped and the transliteration comes back as one line), and lyrics need the line structure kept.
import type { OnlineResult } from "./google";
import { NATIVE_SCRIPT_LANGS } from "./google";
import { baseLanguage, guessLanguageFromScript, isLatin, languageName, sameText, uniqueLines } from "./text";

export type Mode = "off" | "translate" | "transliterate" | "both";
export const MODES: Mode[] = ["off", "translate", "transliterate", "both"];

export interface LineResult {
  translation?: string;
  transliteration?: string;
}

export type Translate = (line: string) => Promise<string>;

export interface Deps {
  /** Online translation + transliteration of one line (through the background, cached). */
  online(line: string): Promise<OnlineResult>;
  /** Romanised text → native script (through the background, cached). */
  native(line: string, lang: string): Promise<string | null>;
  /** On-device language detection; null when the browser has none or isn't sure. */
  detect(text: string): Promise<string | null>;
  /** On-device translator from `source`; "needs-click" when its model must be downloaded first (needs a click). */
  translator(source: string, onProgress: (fraction: number) => void): Promise<Translate | "needs-click" | null>;
}

export type Status =
  | { kind: "working"; text: string }
  | { kind: "done"; text: string; online: boolean }
  | { kind: "needs-online"; text: string }
  | { kind: "needs-click"; text: string }
  | { kind: "error"; text: string };

export interface RunOptions {
  mode: Mode;
  onlineAllowed: boolean;
  target: string;
  signal: AbortSignal;
  onLine(key: string, result: LineResult): void;
  onStatus(status: Status): void;
}

const CONCURRENCY = 6;
const DETECT_SAMPLE_LINES = 12;

async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** The song's language: on-device detector, then Google (if allowed), then a guess from the script. */
async function detectLanguage(lines: string[], onlineAllowed: boolean, deps: Deps): Promise<string | null> {
  const text = lines.join("\n");
  const local = await deps.detect(text).catch(() => null);
  if (local) return local;
  if (onlineAllowed) {
    const r = await deps.online(lines.slice(0, DETECT_SAMPLE_LINES).join("\n")).catch(() => null);
    if (r && r.source !== "und") return r.extended;
  }
  return guessLanguageFromScript(text);
}

export async function runLyrics(rawLines: string[], deps: Deps, o: RunOptions): Promise<void> {
  const lines = uniqueLines(rawLines);
  const status = (s: Status): void => {
    if (!o.signal.aborted) o.onStatus(s);
  };
  if (o.mode === "off" || !lines.length) return;

  let wantTranslation = o.mode === "translate" || o.mode === "both";
  const wantTransliteration = o.mode === "transliterate" || o.mode === "both";
  if (wantTransliteration && !o.onlineAllowed) {
    return status({ kind: "needs-online", text: "Transliteration uses Google Translate online." });
  }

  status({ kind: "working", text: "Detecting the language…" });
  const lang = await detectLanguage(lines, o.onlineAllowed, deps);
  if (o.signal.aborted) return;
  const name = lang ? languageName(lang) : "";
  const romanised = !!lang && /-latn$/i.test(lang);
  const notes: string[] = [];

  let translate: Translate | null = null;
  let onlineTranslation = false;
  if (wantTranslation) {
    if (!lang) {
      if (!o.onlineAllowed) return status({ kind: "needs-online", text: "Detecting this song’s language needs Google Translate online." });
      onlineTranslation = true; // Google detects per line
    } else if (baseLanguage(lang) === o.target && !romanised) {
      wantTranslation = false;
      notes.push(`Already in ${languageName(o.target)}`);
    } else {
      const local = romanised
        ? null
        : await deps
            .translator(baseLanguage(lang), (f) =>
              status({ kind: "working", text: `Downloading the ${name} model… ${Math.round(f * 100)}%` }),
            )
            .catch(() => null);
      if (o.signal.aborted) return;
      if (typeof local === "function") translate = local;
      else if (o.onlineAllowed) onlineTranslation = true;
      else if (local === "needs-click") return status({ kind: "needs-click", text: `Download the on-device ${name} model to translate.` });
      else return status({ kind: "needs-online", text: `Translating ${name || "this song"} needs Google Translate online.` });
    }
  }
  if (!wantTranslation && !wantTransliteration) return status({ kind: "done", text: notes.join(" · "), online: false });

  let done = 0;
  let failed = 0;
  let transliterated = 0;
  const progress = () => status({ kind: "working", text: `${wantTranslation ? "Translating" : "Transliterating"}… ${done}/${lines.length}` });
  progress();

  await pool(lines, CONCURRENCY, async (line) => {
    if (o.signal.aborted) return;
    try {
      const result: LineResult = {};
      const needOnline = wantTransliteration || onlineTranslation;
      const online = needOnline ? await deps.online(line) : null;
      if (wantTranslation) result.translation = translate ? await translate(line) : online!.translation;
      if (wantTransliteration && online) {
        if (!isLatin(line)) result.transliteration = online.transliteration;
        else if (/-latn$/i.test(online.extended) && NATIVE_SCRIPT_LANGS.has(baseLanguage(online.extended))) {
          result.transliteration = (await deps.native(line, baseLanguage(online.extended))) ?? undefined;
        }
      }
      if (result.translation && sameText(result.translation, line)) delete result.translation;
      if (result.transliteration && sameText(result.transliteration, line)) delete result.transliteration;
      if (result.transliteration) transliterated++;
      if (!o.signal.aborted) o.onLine(line, result);
    } catch {
      failed++;
    }
    done++;
    progress();
  });
  if (o.signal.aborted) return;

  if (failed) return status({ kind: "error", text: `${failed} of ${lines.length} lines couldn’t be done.` });
  if (wantTransliteration && !transliterated) notes.push("Nothing to transliterate");
  const online = wantTransliteration || onlineTranslation;
  const how = wantTranslation ? (translate ? "on-device" : "Google Translate online") : "Google Translate online";
  status({
    kind: "done",
    text: [romanised ? `${name} in Latin letters` : name && wantTranslation ? `${name} → ${languageName(o.target)}` : name, ...notes, how]
      .filter(Boolean)
      .join(" · "),
    online,
  });
}

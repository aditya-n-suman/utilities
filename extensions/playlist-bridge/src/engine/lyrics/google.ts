// Online translation and transliteration through Google's keyless web endpoints (unofficial, no account), called
// from the background only after the user allowed online translation on the lyrics bar. All of them send CORS
// headers for any origin, so no host permission is needed.
//   - translate_a/single?client=gtx: translation, detected language (with script, e.g. "hi-Latn" for romanised
//     Hindi) and the source in Latin letters (dt=rm). Rate-limits busy IPs with a 429 / captcha page.
//   - translate_a/t?client=dict-chrome-ex: translation and detected language only. Used when gtx refuses. It
//     returns romanised lyrics untranslated.
//   - inputtools: Google Input Tools, which turns romanised text ("tum hi ho") into its native script.
import { http } from "../http";

const GTX_URL = "https://translate.googleapis.com/translate_a/single";
const DICT_URL = "https://translate.googleapis.com/translate_a/t";
const INPUT_TOOLS_URL = "https://inputtools.google.com/request";

/** Languages Input Tools can write from Latin letters. */
export const NATIVE_SCRIPT_LANGS = new Set([
  "am", "ar", "bn", "el", "fa", "gu", "he", "hi", "kn", "ml", "mr", "ne", "or", "pa", "ru", "sa", "si", "sr", "ta",
  "te", "th", "ti", "uk", "ur",
]);

export interface OnlineResult {
  translation: string;
  /** The source in Latin letters, when Google gave one (gtx only). */
  transliteration?: string;
  /** Detected language, e.g. "hi". */
  source: string;
  /** Detected language with script when Google gives it, e.g. "hi-Latn" for romanised Hindi. */
  extended: string;
}

type Fetch = typeof http;

interface GtxResponse {
  sentences?: { trans?: string; src_translit?: string }[];
  src?: string;
  ld_result?: { extended_srclangs?: string[] };
}

export function parseGtx(d: GtxResponse): OnlineResult {
  const sentences = d.sentences ?? [];
  const translation = sentences.map((s) => s.trans ?? "").join("");
  if (!sentences.some((s) => typeof s.trans === "string")) throw new Error("Google Translate sent no translation");
  const transliteration = sentences.find((s) => s.src_translit)?.src_translit;
  const source = d.src ?? "und";
  return { translation, transliteration, source, extended: d.ld_result?.extended_srclangs?.[0] ?? source };
}

/** dict-chrome-ex with one q and sl=auto: [["translation","lang"]]. */
export function parseDict(d: unknown): OnlineResult {
  const first = Array.isArray(d) ? d[0] : undefined;
  const [translation, source] = Array.isArray(first) ? first : [first, undefined];
  if (typeof translation !== "string") throw new Error("Google Translate sent no translation");
  const lang = typeof source === "string" ? source : "und";
  return { translation, source: lang, extended: lang };
}

async function getJson(url: string, fetchImpl: Fetch): Promise<unknown> {
  const res = await fetchImpl(url, { credentials: "omit", timeoutMs: 15_000 });
  if (!res.ok) throw new Error(`Google Translate answered ${res.status}`);
  return res.json();
}

export async function googleTranslate(text: string, target: string, fetchImpl: Fetch = http): Promise<OnlineResult> {
  const gtx = new URLSearchParams([
    ["client", "gtx"],
    ["sl", "auto"],
    ["tl", target],
    ["dt", "t"],
    ["dt", "rm"],
    ["dj", "1"],
    ["q", text],
  ]);
  try {
    return parseGtx((await getJson(`${GTX_URL}?${gtx}`, fetchImpl)) as GtxResponse);
  } catch (gtxError) {
    const dict = new URLSearchParams({ client: "dict-chrome-ex", sl: "auto", tl: target, q: text });
    try {
      return parseDict(await getJson(`${DICT_URL}?${dict}`, fetchImpl));
    } catch {
      throw gtxError;
    }
  }
}

/** "tum hi ho", "hi" → "तुम ही हो". Null when Input Tools has no answer. */
export async function googleNativeScript(text: string, lang: string, fetchImpl: Fetch = http): Promise<string | null> {
  const params = new URLSearchParams({
    text,
    itc: `${lang}-t-i0-und`,
    num: "1",
    cp: "0",
    cs: "1",
    ie: "utf-8",
    oe: "utf-8",
  });
  const d = (await getJson(`${INPUT_TOOLS_URL}?${params}`, fetchImpl)) as [string, [string, string[]][]?];
  return d[0] === "SUCCESS" ? (d[1]?.[0]?.[1]?.[0] ?? null) : null;
}

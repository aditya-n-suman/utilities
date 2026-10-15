// Online translation and transliteration through Google's web endpoints (unofficial, no account), called from the
// background only after the user allowed online translation on the lyrics bar.
// WIP: the translation endpoint is still to be chosen (keyless translate_a/single?client=gtx is the candidate).
//   - inputtools: Google Input Tools, which turns romanised text ("tum hi ho") into its native script. No key.
import { http } from "../http";

const INPUT_TOOLS_URL = "https://inputtools.google.com/request";

/** Languages Input Tools can write from Latin letters. */
export const NATIVE_SCRIPT_LANGS = new Set([
  "am", "ar", "bn", "el", "fa", "gu", "he", "hi", "kn", "ml", "mr", "ne", "or", "pa", "ru", "sa", "si", "sr", "ta",
  "te", "th", "ti", "uk", "ur",
]);

export interface OnlineResult {
  translation: string;
  /** The source written in Latin letters; equals the source when it already is. */
  transliteration: string;
  /** Detected language, e.g. "hi". */
  source: string;
  /** Detected language with script when Google gives it, e.g. "hi-Latn" for romanised Hindi. */
  extended: string;
}

type Fetch = typeof http;

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
  const res = await fetchImpl(`${INPUT_TOOLS_URL}?${params}`, { credentials: "omit", timeoutMs: 15_000 });
  if (!res.ok) throw new Error(`Google Input Tools answered ${res.status}`);
  const d = (await res.json()) as [string, [string, string[]][]?];
  return d[0] === "SUCCESS" ? (d[1]?.[0]?.[1]?.[0] ?? null) : null;
}

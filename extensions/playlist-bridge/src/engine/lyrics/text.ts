// Line handling and script detection for lyrics. Pure functions, shared by the content script and tests.

/** Lyrics as displayed: one entry per line, blank lines kept (they separate verses). */
export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** The text that gets translated for a line; repeated lines (choruses) share it. Empty for blank lines. */
export const lineKey = (line: string) => line.trim().replace(/\s+/g, " ");

/** Distinct non-blank lines, in order of first appearance. */
export function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines.map(lineKey).filter(Boolean))];
}

/** True when every letter in the line is Latin (or there are no letters). */
export const isLatin = (line: string) => !/[^\P{L}\p{Script=Latin}]/u.test(line);

/** True for right-to-left scripts, so the original line keeps its direction. */
export const isRtl = (line: string) => /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(line);

const SCRIPTS: [RegExp, string][] = [
  [/\p{Script=Devanagari}/u, "hi"],
  [/\p{Script=Bengali}/u, "bn"],
  [/\p{Script=Gurmukhi}/u, "pa"],
  [/\p{Script=Gujarati}/u, "gu"],
  [/\p{Script=Oriya}/u, "or"],
  [/\p{Script=Tamil}/u, "ta"],
  [/\p{Script=Telugu}/u, "te"],
  [/\p{Script=Kannada}/u, "kn"],
  [/\p{Script=Malayalam}/u, "ml"],
  [/\p{Script=Sinhala}/u, "si"],
  [/\p{Script=Thai}/u, "th"],
  [/\p{Script=Hangul}/u, "ko"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "ja"],
  [/\p{Script=Han}/u, "zh"],
  [/\p{Script=Hebrew}/u, "he"],
  [/\p{Script=Greek}/u, "el"],
  [/\p{Script=Cyrillic}/u, "ru"],
  [/\p{Script=Arabic}/u, "ar"],
];

/**
 * Best guess at the language from its script, for when no detector is available. Null for Latin text (could be
 * anything). Rough by nature: Devanagari is taken as Hindi, Cyrillic as Russian.
 */
export function guessLanguageFromScript(text: string): string | null {
  const counts = new Map<string, number>();
  let letters = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    letters++;
    const hit = SCRIPTS.find(([re]) => re.test(ch));
    if (hit) counts.set(hit[1], (counts.get(hit[1]) ?? 0) + 1);
  }
  if (!letters) return null;
  // Japanese mixes kanji (Han) with kana, so any real amount of kana means Japanese.
  if ((counts.get("ja") ?? 0) >= letters * 0.1) return "ja";
  const [lang, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (!lang || n < letters * 0.3) return null;
  if (lang === "ar") {
    if (/[ٹڈڑںےۓھہ]/.test(text)) return "ur";
    if (/[پچژگ]/.test(text)) return "fa";
  }
  return lang;
}

/** "hi-Latn" → "hi". */
export const baseLanguage = (lang: string) => lang.split("-")[0]!.toLowerCase();

/** English name of a language code, e.g. "ur" → "Urdu". */
export function languageName(lang: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(baseLanguage(lang)) ?? lang;
  } catch {
    return lang;
  }
}

/** True when two strings only differ in case, spacing or punctuation, so showing both adds nothing. */
export function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");
  return norm(a) === norm(b);
}

import type { DateFormat, Location } from "./types";

export const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

const RTL_LANGS = /^(ar|he|fa|ur|ps|sd|ug|yi|dv)(-|$)/;

export const isRtlLocale = (locale: string) => RTL_LANGS.test(locale);
export const isArabic = (locale: string) => /^ar(-|$)/.test(locale);

/** "2025-02" → "Feb 2025" (per format and locale). Unparseable input is returned as is. */
export function formatDate(d: string | undefined, fmt: DateFormat, locale: string): string {
  if (!d) return "";
  if (d === "present") return isArabic(locale) ? "حتى الآن" : "Present";
  if (!DATE_RE.test(d)) return d;
  const [y, m] = d.split("-");
  if (!m || fmt === "YYYY") return y;
  if (fmt === "MM/YYYY") return `${m}/${y}`;
  if (fmt === "YYYY-MM") return `${y}-${m}`;
  const date = new Date(Date.UTC(+y, +m - 1, 1));
  return date.toLocaleDateString(locale, {
    month: fmt === "MMMM YYYY" ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(start: string | undefined, end: string | undefined, fmt: DateFormat, locale: string): string {
  const a = formatDate(start, fmt, locale);
  const z = formatDate(end, fmt, locale);
  return a && z ? `${a} – ${z}` : a || z;
}

/** "https://www.github.com/jdoe/" → "github.com/jdoe" */
export const stripUrl = (u: string | undefined) =>
  (u ?? "").replace(/^(https?:\/\/|mailto:)(www\.)?/, "").replace(/\/$/, "");

/** City plus region (or country when there's no region): "Noida, UP". Arabic uses its own comma. */
export const formatLocation = (l: Location | undefined, locale = "en-US") =>
  l ? [l.city, l.region || l.country].filter(Boolean).join(isArabic(locale) ? "، " : ", ") : "";

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase();
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Mix a colour towards white: amount 0 = unchanged, 1 = white. */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  return (
    "#" +
    [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, "0"))
      .join("")
  );
}

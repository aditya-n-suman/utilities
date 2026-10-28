// A compact, redacted outline of a JSON value for summary.md: keys, types and one short sample per field.
// Arrays show their length and the merged keys of their first few items. findStringPaths locates where a
// string (the product name you added) sits in a response, which tells the next phases where products live.

import { REDACTED, redactValue, sensitiveKey } from "./redact.ts";

const MAX_DEPTH = 8;
const MAX_KEYS = 60;
const MAX_SAMPLE = 60;
const ARRAY_ITEMS_MERGED = 3;

export function outline(value: unknown, indent = 0, key = "", depth = 0): string {
  const pad = "  ".repeat(indent);
  const label = key ? `${key}: ` : "";
  if (value === null) return `${pad}${label}null`;
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}${label}[0]`;
    if (depth >= MAX_DEPTH) return `${pad}${label}[${value.length}] …`;
    const objects = value.slice(0, ARRAY_ITEMS_MERGED).filter(isPlainObject);
    if (objects.length) {
      const merged = Object.assign({}, ...objects.slice().reverse()) as Record<string, unknown>;
      return `${pad}${label}[${value.length}] of\n${outlineObject(merged, indent + 1, depth + 1)}`;
    }
    // Primitives inherit the array's key, so `long_lat: [76.9, 28.4]` is redacted like `lat` would be.
    const first = outline(value[0], 0, key, depth + 1).trim();
    return `${pad}${label}[${value.length}] of ${key ? first.slice(key.length + 2) : first}`;
  }
  if (isPlainObject(value)) {
    if (depth >= MAX_DEPTH) return `${pad}${label}{…}`;
    return `${pad}${label}{\n${outlineObject(value, indent + 1, depth + 1)}\n${pad}}`;
  }
  return `${pad}${label}${sample(value, key)}`;
}

function outlineObject(obj: Record<string, unknown>, indent: number, depth: number): string {
  const keys = Object.keys(obj);
  const lines = keys.slice(0, MAX_KEYS).map((k) => outline(obj[k], indent, k, depth));
  if (keys.length > MAX_KEYS) lines.push(`${"  ".repeat(indent)}… ${keys.length - MAX_KEYS} more keys`);
  return lines.join("\n");
}

function sample(v: unknown, key: string): string {
  if (typeof v === "string") {
    if (key && sensitiveKey(key)) return `string ${REDACTED}`;
    const s = redactValue(v);
    return `string ${JSON.stringify(s.length > MAX_SAMPLE ? `${s.slice(0, MAX_SAMPLE)}…` : s)}`;
  }
  if (typeof v === "number") return key && sensitiveKey(key) ? `number ${REDACTED}` : `number ${v}`;
  return `${typeof v} ${String(v)}`;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** JSON paths (like `data.products[3].name`) of string values containing `needle`, case-insensitively. */
export function findStringPaths(value: unknown, needle: string, limit = 5): string[] {
  const n = needle.toLowerCase();
  const found: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (found.length >= limit) return;
    if (typeof v === "string") {
      if (v.toLowerCase().includes(n)) found.push(path || "(root)");
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (isPlainObject(v)) {
      for (const [k, item] of Object.entries(v)) walk(item, path ? `${path}.${k}` : k);
    }
  };
  walk(value, "");
  return found;
}

/** Parses a JSON body, or returns undefined. Tolerates XSSI prefixes like `)]}'`. */
export function parseJson(body: string | undefined): unknown {
  if (!body) return undefined;
  const trimmed = body.replace(/^\)\]\}'?\s*/, "").trim();
  if (!/^[[{]/.test(trimmed)) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/**
 * JSON from a response: the body itself, or for HTML the biggest JSON script block (Next.js `__NEXT_DATA__`,
 * `application/json`, `application/ld+json`), where server-rendered pages keep their data.
 */
export function responseJson(body: string | undefined): unknown {
  const direct = parseJson(body);
  if (direct !== undefined || !body || !/<script/i.test(body)) return direct;
  let best: unknown;
  let bestLen = 0;
  for (const m of body.matchAll(/<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const parsed = parseJson(m[1]);
    if (parsed !== undefined && m[1].length > bestLen) {
      best = parsed;
      bestLen = m[1].length;
    }
  }
  return best;
}

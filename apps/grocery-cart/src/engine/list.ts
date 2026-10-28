// The list parser (LIST_FORMAT.md): one item per line, `<what to buy> ; <how much> ; <note>`.
// Blank lines and `#` comments are skipped. A line that can't be read becomes an error for that line only, so the
// UI can show the rest and point at the bad line.

import { type Amount, parseAmount } from "./units.ts";

export type Quantity = { kind: "count"; value: number } | ({ kind: "amount" } & Amount);

export interface ListItem {
  /** 1-based line number in the pasted text */
  line: number;
  raw: string;
  query: string;
  qty: Quantity;
  note?: string;
}

export interface ListError {
  line: number;
  raw: string;
  error: string;
}

export interface ParsedList {
  items: ListItem[];
  errors: ListError[];
}

const COUNT = /^(?:[x×*]\s*)?(\d+)(?:\s*(?:pcs?|pieces?|nos?|packs?|pkts?|packets?|units?))?$/i;

export function parseQuantity(s: string): Quantity | string {
  const t = s.trim();
  if (!t) return { kind: "count", value: 1 };
  const count = COUNT.exec(t);
  if (count) {
    const value = Number(count[1]);
    return value > 0 ? { kind: "count", value } : "the count must be at least 1";
  }
  const amount = parseAmount(t);
  if (amount) return { kind: "amount", ...amount };
  if (/^\d/.test(t)) return `unknown unit in "${t}" (use g, kg, ml or L, or x6 for a count)`;
  return `can't read "${t}" as an amount (examples: x6, 5 kg, 500 g, 2 L)`;
}

export function parseList(text: string): ParsedList {
  const items: ListItem[] = [];
  const errors: ListError[] = [];
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw || raw.startsWith("#")) return;
    const line = i + 1;
    const [name = "", howMuch = "", ...rest] = raw.split(";");
    const query = name.trim().replace(/\s+/g, " ");
    if (!query) return errors.push({ line, raw, error: "the name is missing (it goes before the first ;)" });
    const qty = parseQuantity(howMuch);
    if (typeof qty === "string") return errors.push({ line, raw, error: qty });
    // A stray extra ";" belongs to the note rather than failing the line.
    const note = rest.join(";").trim();
    items.push({ line, raw, query, qty, ...(note ? { note } : {}) });
  });
  return { items, errors };
}

export function formatQuantity(q: Quantity): string {
  return q.kind === "count" ? `x${q.value}` : `${q.value} ${q.unit}`;
}

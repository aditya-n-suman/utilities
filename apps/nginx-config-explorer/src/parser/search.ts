import { nodeText } from "./summary";
import type { ViewNode } from "./types";

export interface SearchResult {
  /** Matching node ids in document order. */
  ids: string[];
  /** Ids of every block, include and file holding a match, which must be open to show it. */
  reveal: Set<string>;
  error?: string;
}

/**
 * Build a matcher from the search box text: plain text is a case-insensitive
 * substring, `/…/` is a case-insensitive regular expression.
 */
export function compileQuery(query: string): { re: RegExp | null; error?: string } {
  const q = query.trim();
  if (!q) return { re: null };
  const rx = /^\/(.+)\/([a-z]*)$/.exec(q);
  if (rx) {
    try {
      const flags = rx[2].includes("i") ? rx[2] : rx[2] + "i";
      return { re: new RegExp(rx[1], flags.replace(/g/g, "") + "g") };
    } catch (e) {
      return { re: null, error: (e as Error).message };
    }
  }
  return { re: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") };
}

export function search(tree: ViewNode[], query: string, includeComments: boolean): SearchResult {
  const { re, error } = compileQuery(query);
  const ids: string[] = [];
  const reveal = new Set<string>();
  if (!re) return { ids, reveal, error };

  const walk = (nodes: ViewNode[], ancestors: string[]) => {
    for (const n of nodes) {
      if (n.kind === "comment" && !includeComments) continue;
      const text = n.kind === "comment" ? n.text : nodeText(n) + (n.trailing && includeComments ? " " + n.trailing : "");
      re.lastIndex = 0;
      if (re.test(text)) {
        ids.push(n.id);
        ancestors.forEach((a) => reveal.add(a));
      }
      if (n.children.length) walk(n.children, [...ancestors, n.id]);
    }
  };
  walk(tree, []);
  return { ids, reveal };
}

/** Split text into plain and matched parts for highlighting. */
export function splitMatches(text: string, re: RegExp | null): { text: string; hit: boolean }[] {
  if (!re) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  let at = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    if (m.index > at) out.push({ text: text.slice(at, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

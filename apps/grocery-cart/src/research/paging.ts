// How does JioMart's page ask for search page 2? Reads your Phase 0 capture (raw.jsonl, on your machine) and,
// for each search request with a page_id, says which field of the previous search answer it came from.
// Prints field names, lengths and short values only: no tokens.
//
//   ./instruction.sh paging [capture-dir]

import { parseArgs } from "node:util";
import { SEARCH_PATH } from "../engine/jiomart/api.ts";
import { latestCaptureDir, loadCapture } from "./capture.ts";
import { isMain } from "./cli.ts";
import { parseJson } from "./shape.ts";

/** Every string or number leaf of a JSON value, by path. */
function leaves(v: unknown, path = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof v === "string" || typeof v === "number") out.set(path, String(v));
  else if (Array.isArray(v)) v.slice(0, 3).forEach((x, i) => leaves(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "items" && k !== "filters") leaves(x, path ? `${path}.${k}` : k, out);
  return out;
}

const describe = (v: string) => (v.length <= 12 ? JSON.stringify(v) : `${v.length} chars`);

export function pagingReport(dir: string): string {
  const c = loadCapture(dir);
  const searches = c.requests.filter((r) => {
    try {
      return new URL(r.url).pathname === SEARCH_PATH;
    } catch {
      return false;
    }
  });
  const lines = [`# Search paging (${searches.length} search requests in ${dir})`, ""];
  let previous: Map<string, string> | undefined;
  for (const r of searches) {
    const u = new URL(r.url);
    const params = [...u.searchParams.keys()].filter((k) => k !== "f" && k !== "q");
    const pageId = u.searchParams.get("page_id");
    const json = parseJson(r.resBody) as { items?: unknown[]; page?: unknown } | undefined;
    lines.push(`- ${r.step}: params ${params.map((k) => `${k}=${describe(u.searchParams.get(k) ?? "")}`).join(", ") || "(none besides f, q)"} → ${json?.items?.length ?? "?"} items, page ${JSON.stringify(json?.page ?? {})}`.replace(/"next_id":"[^"]{13,}"/, '"next_id":"…"'));
    if (pageId && previous) {
      const from = [...previous].filter(([, v]) => v === pageId).map(([k]) => k);
      lines.push(`  - page_id matches the previous answer's: ${from.length ? from.map((k) => `\`${k}\``).join(", ") : "nothing (built some other way)"}`);
    }
    if (json) previous = leaves(json);
  }
  return lines.join("\n");
}

if (isMain(import.meta.url)) {
  const { positionals } = parseArgs({ allowPositionals: true });
  console.log(pagingReport(positionals[0] ?? latestCaptureDir("captures", "jiomart")));
}

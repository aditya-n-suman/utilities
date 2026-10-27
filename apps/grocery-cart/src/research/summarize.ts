// Turns a capture into summary.md: a redacted report of what the shop's page sent at each step, with the likely
// search and cart requests outlined in detail. Header values, cookies and personal fields are never written.
//
//   npx tsx src/research/summarize.ts [capture-dir]        (default: newest capture of --site, jiomart)

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { isMain } from "./cli.ts";
import { latestCaptureDir, loadCapture, stepData, type Capture, type CapturedRequest } from "./capture.ts";
import { addCandidate, cartCandidates, searchCandidates } from "./classify.ts";
import { customHeaderNames, REDACTED, redactValue, sensitiveKey } from "./redact.ts";
import { outline, responseJson } from "./shape.ts";

/** URL with query values redacted, except the search term and short plain values (page=2, size=20). */
export function safeUrl(url: string, term?: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return redactValue(url);
  }
  const params = [...u.searchParams].map(([k, v]) => {
    const keep = !sensitiveKey(k) && (/^[\w .,:-]{0,24}$/.test(v) || (term && v.toLowerCase().includes(term.toLowerCase())));
    return `${k}=${keep ? redactValue(v) : REDACTED}`;
  });
  return `${u.host}${redactValue(decodeURIComponentSafe(u.pathname))}${params.length ? `?${params.join("&")}` : ""}`;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function bodyOutline(body: string | undefined): string {
  if (!body) return "(none)";
  const json = responseJson(body);
  if (json !== undefined) return outline(json);
  if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body)) {
    return [...new URLSearchParams(body)]
      .map(([k, v]) => `${k}: ${sensitiveKey(k) ? REDACTED : JSON.stringify(redactValue(v).slice(0, 60))}`)
      .join("\n");
  }
  return `text, ${body.length} chars: ${JSON.stringify(redactValue(body.slice(0, 120)))}`;
}

function detail(req: CapturedRequest, term: string | undefined, product: string | undefined, extra: string[] = []): string {
  const lines = [
    `#### ${req.method} ${safeUrl(req.url, term)}`,
    `- step: \`${req.step}\` · type: ${req.resourceType} · status: ${req.status ?? req.failure ?? "?"} · response: ${req.resHeaders?.["content-type"] ?? "?"}${req.resBodyNote ? ` (${req.resBodyNote})` : ""}`,
    `- custom request headers (names only): ${customHeaderNames(req.reqHeaders).map((h) => `\`${h}\``).join(", ") || "none"}`,
    `- sends cookies: ${req.reqHeaders?.cookie ? "yes" : "no"}`,
    ...extra,
  ];
  if (product && req.resBody && responseJson(req.resBody) === undefined && req.resBody.toLowerCase().includes(product.toLowerCase())) {
    lines.push("- the product name appears in the response, but not inside JSON (HTML rendered on the server)");
  }
  lines.push("", "Request body:", "```", bodyOutline(req.reqBody), "```", "", "Response:", "```", truncate(bodyOutline(req.resBody), 12_000), "```", "");
  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n… (${s.length - max} more chars)` : s;
}

export function summarize(c: Capture): string {
  const term = stepData(c, "search", "term");
  const product = stepData(c, "add", "product");
  const out: string[] = [
    `# Phase 0 capture: ${c.site}`,
    "",
    `Recorded ${c.requests.length} requests (${c.requests.filter((r) => r.siteHost).length} to the shop's own domains).`,
    `Search term: ${term ? `"${term}"` : "(not given)"} · product added: ${product ? `"${product}"` : "(not given)"}`,
    "",
    "Redacted: header values, cookies, tokens, phone numbers, e-mails, addresses and personal-name fields. Skim it before sharing anyway.",
    "",
    "## Steps",
    "",
    "| Step | At | Fully recorded requests | Other requests |",
    "|---|---|---|---|",
    ...c.steps.map((s) => {
      const rs = c.requests.filter((r) => r.step === s.step);
      return `| ${s.step} | ${(s.t / 1000).toFixed(1)} s | ${rs.filter((r) => r.reqHeaders).length} | ${rs.filter((r) => !r.reqHeaders).length} |`;
    }),
    "",
  ];

  const searches = searchCandidates(c);
  out.push("## Search candidates", "");
  if (!term) out.push("No search term was recorded.", "");
  else if (!searches.length) out.push(`No recorded request carried "${term}".`, "");
  for (const s of searches.slice(0, 3)) {
    out.push(
      detail(s.req, term, product, [
        `- score: ${s.score} · product name found at: ${s.productPaths.map((p) => `\`${p}\``).join(", ") || "not found"}`,
      ]),
    );
  }
  if (searches.length > 3) {
    out.push("Other requests carrying the term:", "", ...searches.slice(3, 20).map((s) => `- ${s.req.method} ${safeUrl(s.req.url, term)} (${s.req.status ?? "?"})`), "");
  }

  const add = addCandidate(c);
  out.push("## Cart candidates", "", `Probe would replay for an add: ${add ? `${add.method} ${safeUrl(add.url)}` : "none found"}`, "");
  for (const r of cartCandidates(c).slice(0, 8)) out.push(detail(r, term, product));

  out.push("## All shop requests by step", "");
  for (const s of c.steps) {
    const rs = c.requests.filter((r) => r.step === s.step && r.siteHost);
    if (!rs.length) continue;
    const counts = new Map<string, number>();
    for (const r of rs) {
      const key = `${r.method} ${safeUrl(r.url, term).split("?")[0]} → ${r.status ?? r.failure ?? "?"} (${r.resourceType})`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    out.push(`### ${s.step}`, "", ...[...counts].map(([k, n]) => `- ${k}${n > 1 ? ` ×${n}` : ""}`), "");
  }

  const hosts = new Map<string, number>();
  for (const r of c.requests.filter((r) => !r.siteHost)) {
    try {
      const h = new URL(r.url).host;
      hosts.set(h, (hosts.get(h) ?? 0) + 1);
    } catch {
      /* data: URLs and the like */
    }
  }
  out.push("## Other hosts", "", ...[...hosts].sort((a, b) => b[1] - a[1]).map(([h, n]) => `- ${h} ×${n}`), "");
  return out.join("\n");
}

export function writeSummary(dir: string): string {
  const path = join(dir, "summary.md");
  writeFileSync(path, summarize(loadCapture(dir)));
  return path;
}

if (isMain(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { site: { type: "string", default: "jiomart" } } });
  const dir = positionals[0] ?? latestCaptureDir("captures", values.site!);
  console.log(`Wrote ${writeSummary(dir)}`);
}

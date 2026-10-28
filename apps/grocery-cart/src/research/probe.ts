// Phase 0 probe: answers "can our tool call the shop's own requests from inside your logged-in tab?".
// It takes the best search request from a capture, swaps in new search words, sends it with fetch() from the
// shop's page (your cookies, the shop's origin), and reports whether products come back. It tries twice: with the
// custom headers the page sent, and without them, to learn which headers matter. With --add it replays the
// captured add-to-cart once, after you confirm, to check writes work the same way.
//
//   ./instruction.sh probe [--query "toor dal"] [--add] [capture-dir]
// Results are printed and appended to <capture-dir>/probe.md (redacted, safe to share).

import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import type { Page } from "playwright-core";
import { type CapturedRequest, latestCaptureDir, loadCapture, stepData } from "./capture.ts";
import { connect, DEFAULT_ENDPOINT, sitePage } from "./cdp.ts";
import { addCandidate, replaceTermInBody, replaceTermInUrl, searchCandidates } from "./classify.ts";
import { isMain } from "./cli.ts";
import { customHeaderNames } from "./redact.ts";
import { isPlainObject, outline, responseJson } from "./shape.ts";
import { BROWSER_HEADERS } from "../local/headers.ts";
import { getSite } from "./sites.ts";
import { safeUrl } from "./summarize.ts";


export function replayHeaders(req: CapturedRequest, withCustom: boolean): Record<string, string> {
  const custom = new Set(customHeaderNames(req.reqHeaders));
  return Object.fromEntries(
    Object.entries(req.reqHeaders ?? {}).filter(([k]) => !BROWSER_HEADERS.test(k) && (withCustom || !custom.has(k))),
  );
}

export interface ReplayResult {
  status: number;
  contentType: string;
  body: string;
  error?: string;
}

export async function replay(
  page: Page,
  r: { url: string; method: string; headers: Record<string, string>; body?: string },
): Promise<ReplayResult> {
  return page.evaluate(async ({ url, method, headers, body }) => {
    try {
      const res = await fetch(url, { method, headers, body, credentials: "include" });
      return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: await res.text() };
    } catch (e) {
      return { status: 0, contentType: "", body: "", error: String(e) };
    }
  }, r);
}

/** The biggest array of objects that have a name-like string field, and those names: a guess at "the products". */
export function productNames(json: unknown, limit = 8): { path: string; count: number; names: string[] } | undefined {
  let best: { path: string; count: number; names: string[] } | undefined;
  const nameOf = (o: Record<string, unknown>): string | undefined => {
    for (const k of ["name", "display_name", "displayName", "product_name", "productName", "title", "item_name"]) {
      if (typeof o[k] === "string" && o[k]) return o[k] as string;
    }
    return undefined;
  };
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) {
      const names = v.filter(isPlainObject).map(nameOf).filter((n): n is string => !!n);
      if (names.length && (!best || names.length > best.count)) best = { path: path || "(root)", count: names.length, names: names.slice(0, limit) };
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (isPlainObject(v)) {
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    }
  };
  walk(json, "");
  return best;
}

export interface SearchProbe {
  template: CapturedRequest;
  query: string;
  attempts: { label: string; result: ReplayResult; products?: ReturnType<typeof productNames> }[];
}

export async function probeSearch(page: Page, template: CapturedRequest, term: string, query: string): Promise<SearchProbe> {
  const url = replaceTermInUrl(template.url, term, query);
  const body = template.reqBody === undefined ? undefined : replaceTermInBody(template.reqBody, term, query);
  const attempts: SearchProbe["attempts"] = [];
  for (const withCustom of [true, false]) {
    if (!withCustom && !customHeaderNames(template.reqHeaders).length) break;
    const result = await replay(page, { url, method: template.method, headers: replayHeaders(template, withCustom), body });
    attempts.push({
      label: withCustom ? "with the page's custom headers" : "without custom headers",
      result,
      products: productNames(responseJson(result.body)),
    });
  }
  return { template, query, attempts };
}

export function formatSearchProbe(p: SearchProbe): string {
  const lines = [`### Search replay: "${p.query}"`, "", `Template: ${p.template.method} ${safeUrl(p.template.url)}`, ""];
  for (const a of p.attempts) {
    const ok = a.result.status >= 200 && a.result.status < 300 && !!a.products;
    lines.push(
      `- ${ok ? "✅" : "❌"} ${a.label}: status ${a.result.status}${a.result.error ? ` (${a.result.error})` : ""}, ${a.result.contentType || "no content type"}, ${a.result.body.length} chars`,
    );
    if (a.products) {
      const hits = a.products.names.filter((n) => p.query.toLowerCase().split(/\s+/).some((w) => n.toLowerCase().includes(w))).length;
      lines.push(`  - ${a.products.count} products at \`${a.products.path}\`; ${hits}/${a.products.names.length} of the first names contain a query word:`);
      lines.push(...a.products.names.map((n) => `    - ${n}`));
    } else if (a.result.body) {
      lines.push("  - no product list recognised. Response outline:", "```", outline(responseJson(a.result.body) ?? a.result.body.slice(0, 300)).slice(0, 3000), "```");
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      site: { type: "string", default: "jiomart" },
      query: { type: "string", default: "toor dal" },
      add: { type: "boolean", default: false },
      endpoint: { type: "string", default: DEFAULT_ENDPOINT },
    },
  });
  const site = getSite(values.site!);
  const dir = positionals[0] ?? latestCaptureDir("captures", site.id);
  const capture = loadCapture(dir);
  const term = stepData(capture, "search", "term");
  const template = searchCandidates(capture)[0]?.req;
  const report = join(dir, "probe.md");
  const { browser, context } = await connect(values.endpoint);
  try {
    const page = await sitePage(context, site);
    appendFileSync(report, `\n## Probe ${new Date().toISOString()}\n\n`);

    if (!term || !template) {
      console.log("No search request found in the capture, so there's nothing to replay. Share summary.md instead.");
    } else {
      const result = formatSearchProbe(await probeSearch(page, template, term, values.query!));
      console.log(result);
      appendFileSync(report, result);
    }

    if (values.add) {
      const add = addCandidate(capture);
      const product = stepData(capture, "add", "product") ?? "the product you added";
      if (!add) {
        console.log("No add-to-cart request found in the capture.");
      } else {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question(
          `\nThis sends the captured add-to-cart again (${add.method} ${safeUrl(add.url)}), which changes your real cart: "${product}" goes back in or up by one.\nType yes to go ahead: `,
        );
        rl.close();
        if (answer.trim().toLowerCase() === "yes") {
          const res = await replay(page, { url: add.url, method: add.method, headers: replayHeaders(add, true), body: add.reqBody });
          const ok = res.status >= 200 && res.status < 300;
          const text = [
            "### Add-to-cart replay",
            "",
            `- ${ok ? "✅" : "❌"} ${add.method} ${safeUrl(add.url)}: status ${res.status}${res.error ? ` (${res.error})` : ""}`,
            "```",
            outline(responseJson(res.body) ?? res.body.slice(0, 300)).slice(0, 4000),
            "```",
            "",
            "Reload the cart page to check it changed, then remove the item again.",
            "",
          ].join("\n");
          console.log(text);
          appendFileSync(report, text);
        }
      }
    }
    console.log(`\nAppended to ${report} (redacted; share it with summary.md).`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

if (isMain(import.meta.url)) await main();

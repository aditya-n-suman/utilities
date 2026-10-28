// Phase 0b (JioMart): can the tool put a product it found itself into your cart, and take it out again?
// Unlike `probe --add`, which replays a captured request, this builds the requests the way Phase 2 will:
// search for new words → pick the first sellable product → read your cart id → add 1 → check the cart →
// remove it → check again. The add is tried first without the page's request signature (x-fp-signature,
// x-fp-date), then with the captured one, to learn whether the signature is checked.
//
//   ./instruction.sh cart-probe ["toor dal"] [capture-dir]
// Asks before touching the cart. Results are printed and appended to <capture-dir>/probe.md (redacted).

import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import type { Page } from "playwright-core";
import { type Capture, type CapturedRequest, latestCaptureDir, loadCapture, stepData } from "./capture.ts";
import { connect, DEFAULT_ENDPOINT, sitePage } from "./cdp.ts";
import { addCandidate, replaceTermInUrl, searchCandidates } from "./classify.ts";
import { isMain } from "./cli.ts";
import { addBody, addedLine, cartId, cartQuantity, cartWriteOk, removeBody, searchItems, withCartId, type SearchItem } from "./jiomart.ts";
import { replay, replayHeaders } from "./probe.ts";
import { REDACTED, redactValue } from "./redact.ts";
import { responseJson } from "./shape.ts";
import { SITES } from "./sites.ts";

const SIGNATURE_HEADERS = ["x-fp-signature", "x-fp-date"];

export interface CartTemplates {
  search: CapturedRequest;
  term: string;
  cartDetail: CapturedRequest;
  add: CapturedRequest;
  remove: CapturedRequest;
}

export function cartTemplates(c: Capture): CartTemplates | string {
  const term = stepData(c, "search", "term");
  const search = searchCandidates(c)[0]?.req;
  const cartDetail = c.requests.find((r) => r.method === "GET" && /\/cart\/v\d+\.\d+\/detail\b/.test(r.url) && r.reqHeaders);
  const add = addCandidate(c);
  const remove = c.requests.find((r) => r.method === "PUT" && /\/cart\/v\d+\.\d+\/detail\b/.test(r.url) && /remove_item/.test(r.reqBody ?? ""));
  if (!term || !search) return "no search request in the capture";
  if (!cartDetail) return "no cart-detail request in the capture";
  if (!add || !/bulk-detail/.test(add.url)) return "no bulk-detail add request in the capture";
  if (!remove) return "no remove_item request in the capture";
  return { search, term, cartDetail, add, remove };
}

type Log = (line: string) => void;

async function getJson(page: Page, req: CapturedRequest, url = req.url) {
  const res = await replay(page, { url, method: "GET", headers: replayHeaders(req, true) });
  return { status: res.status, json: responseJson(res.body) };
}

export async function probeCart(page: Page, t: CartTemplates, query: string, confirm: (item: SearchItem) => Promise<boolean>, log: Log): Promise<void> {
  // Phase 2 has to build this URL itself, so show what the page puts in `f` (long digit runs hidden).
  const f = new URL(t.search.url).searchParams.get("f");
  log(`- search filter \`f\`: ${f === null ? "(none)" : `\`${redactValue(f).replace(/\d{6,}/g, REDACTED)}\``}`);
  const found = await getJson(page, t.search, replaceTermInUrl(t.search.url, t.term, query));
  const items = searchItems(found.json);
  log(`- search "${query}": status ${found.status}, ${items.length} products read`);
  const item = items.find((i) => i.sellable);
  if (!item) return log("- ❌ no sellable product in the results; nothing to add");
  log(`- picked: ${item.name} (uid ${item.uid}, size \`${item.size}\`, ₹${item.price ?? "?"}, max ${item.maxQty ?? "?"})`);

  const cart = await getJson(page, t.cartDetail);
  const id = cartId(cart.json);
  if (!id) return log(`- ❌ cart detail: status ${cart.status}, no cart id found`);
  const before = cartQuantity(cart.json, item.uid);
  log(`- cart detail: status ${cart.status}, cart id found, this product already in cart: ${before}`);
  if (before > 0) return log("- stopped: the product is already in your cart, so removing it afterwards would change your cart");

  if (!(await confirm(item))) return log("- skipped by you");

  const body = JSON.stringify(addBody(item, 1));
  const url = withCartId(t.add.url, id);
  let added: { json: unknown; signed: boolean } | undefined;
  for (const signed of [false, true]) {
    const headers = replayHeaders(t.add, true);
    if (!signed) for (const h of SIGNATURE_HEADERS) delete headers[h];
    const res = await replay(page, { url, method: "POST", headers, body });
    const json = responseJson(res.body);
    const ok = cartWriteOk(res.status, json);
    const message = (json as { message?: string } | undefined)?.message ?? res.error ?? "";
    log(`- ${ok ? "✅" : "❌"} add ${signed ? "with the captured signature" : "without the signature headers"}: status ${res.status}, "${message}"`);
    if (ok) {
      added = { json, signed };
      break;
    }
  }
  if (!added) return log("- ❌ no add worked; the cart should be unchanged (check it)");

  const after = cartQuantity((await getJson(page, t.cartDetail)).json, item.uid);
  log(`- ${after === 1 ? "✅" : "❌"} cart now has ${after} of it`);

  const line = addedLine(added.json, item.uid);
  if (!line) return log("- ❌ the add response doesn't name the new cart line; remove it by hand on the cart page");
  const headers = replayHeaders(t.remove, true);
  if (!added.signed) for (const h of SIGNATURE_HEADERS) delete headers[h];
  const res = await replay(page, { url: withCartId(t.remove.url, id), method: "PUT", headers, body: JSON.stringify(removeBody(item, line)) });
  const json = responseJson(res.body);
  log(`- ${cartWriteOk(res.status, json) ? "✅" : "❌"} remove: status ${res.status}, "${(json as { message?: string } | undefined)?.message ?? res.error ?? ""}"`);
  const end = cartQuantity((await getJson(page, t.cartDetail)).json, item.uid);
  log(`- ${end === 0 ? "✅ cart is back to how it was" : `❌ cart still has ${end}: remove "${item.name}" by hand`}`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { endpoint: { type: "string", default: DEFAULT_ENDPOINT } },
  });
  const query = positionals[0] ?? "toor dal";
  const dir = positionals[1] ?? latestCaptureDir("captures", "jiomart");
  const t = cartTemplates(loadCapture(dir));
  if (typeof t === "string") throw new Error(`Can't run the cart probe: ${t}. Record again with ./instruction.sh record.`);
  const report = join(dir, "probe.md");
  appendFileSync(report, `\n## Cart probe ${new Date().toISOString()}\n\n`);
  const log: Log = (line) => {
    console.log(line);
    appendFileSync(report, `${line}\n`);
  };
  const { browser, context } = await connect(values.endpoint);
  try {
    const page = await sitePage(context, SITES.jiomart);
    await probeCart(
      page,
      t,
      query,
      async (item) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question(`\nThis adds 1 × "${item.name}" to your real JioMart cart, then removes it.\nType yes to go ahead: `);
        rl.close();
        return answer.trim().toLowerCase() === "yes";
      },
      log,
    );
    console.log(`\nAppended to ${report}. Share it.`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

if (isMain(import.meta.url)) await main();

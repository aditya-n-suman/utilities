// Phase 2 live check: runs the engine's JioMart client against your signed-in tab.
// 1. Learns the session from the page (headers, cart query) and both modes' search filters: it asks you to search
//    once in "Quick" and once in "Shop all" on JioMart, and notes which headers, cookies and site-storage keys
//    change between the two (names only).
// 2. Reads the cart; searches a few list lines in both modes; checks paging. Read-only.
// 3. With --cart: in each mode, adds 1 of a product it found, checks the cart, removes it (asks first).
//
//   ./instruction.sh live-check [--cart]
// Writes captures/live-check-<time>.md (redacted, safe to share).

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import type { BrowserContext, Page } from "playwright-core";
import type { Mode, Product } from "../engine/jiomart/api.ts";
import { CartError, JioMartClient, ShopError } from "../engine/jiomart/client.ts";
import { formatAmount } from "../engine/units.ts";
import { connect, DEFAULT_ENDPOINT } from "../research/cdp.ts";
import { REDACTED, redactValue } from "../research/redact.ts";
import { outline, parseJson } from "../research/shape.ts";
import { openJioMartTab } from "./jiomart-tab.ts";

const QUERIES: Record<Mode, string[]> = {
  quick: ["Atta", "Toor dal", "Mustard oil", "Pressure cooker 5 L", "Steel container 5 kg"],
  all: ["Atta", "Pressure cooker 5 L", "Steel container 5 kg", "Tea strainer", "Dish drying basket"],
};
const CART_QUERY: Record<Mode, string> = { quick: "toor dal", all: "tea strainer" };
const MODE_NAME: Record<Mode, string> = { quick: "Quick", all: "Shop all" };

const hash = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 12);
const safeFilter = (f: string) => redactValue(f).replace(/\d{5,}/g, REDACTED);

type Snapshot = { cookies: Map<string, string>; storage: Map<string, string> };

async function snapshot(context: BrowserContext, page: Page): Promise<Snapshot> {
  const cookies = new Map((await context.cookies("https://www.jiomart.com")).map((c) => [c.name, hash(c.value)]));
  const entries = await page
    .evaluate(() => {
      const out: [string, string][] = [];
      for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) out.push([s.key(i)!, s.getItem(s.key(i)!) ?? ""]);
      return out;
    })
    .catch(() => [] as [string, string][]);
  return { cookies, storage: new Map(entries.map(([k, v]) => [k, hash(v)])) };
}

function changed(a: Map<string, string>, b: Map<string, string>): string[] {
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
}

/** A differing header value, shown only if it's JSON (directly or base64), with sensitive keys redacted. */
function headerOutline(value: string): string | undefined {
  let json = parseJson(value);
  if (json === undefined) {
    try {
      json = parseJson(Buffer.from(value, "base64").toString("utf8"));
    } catch {
      /* not base64 */
    }
  }
  return json === undefined ? undefined : outline(json);
}

function describe(p: Product): string {
  const pack = p.pack ? formatAmount(p.pack) : p.pieces ? `${p.pieces} pcs` : (p.packText ?? "?");
  return `${p.name} · ${pack} · ₹${p.price ?? "?"}${p.mrp && p.mrp !== p.price ? ` (MRP ₹${p.mrp})` : ""}${p.sellable ? "" : " · not sellable"}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { cart: { type: "boolean", default: false }, endpoint: { type: "string", default: DEFAULT_ENDPOINT } } });
  mkdirSync("captures", { recursive: true });
  const report = join("captures", `live-check-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.md`);
  writeFileSync(report, `# Live check ${new Date().toISOString()}\n\n`);
  const log = (s = "") => {
    console.log(s);
    appendFileSync(report, `${s}\n`);
  };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const enter = (s: string) => rl.question(`\n${s}\n  Press Enter when done… `);

  const { browser, context } = await connect(values.endpoint);
  try {
    const tab = await openJioMartTab(context);
    await tab.page.bringToFront();

    const before = await snapshot(context, tab.page);
    await enter('1/2  On JioMart, switch to "Quick" and search for anything (e.g. rice).');
    const afterQuick = await snapshot(context, tab.page);
    await enter('2/2  Now switch to "Shop all" and search for anything (e.g. rice).');
    const afterAll = await snapshot(context, tab.page);
    const s = tab.session;

    log("## Session learnt from the page");
    log(`- headers sent again: ${Object.keys(s.headers).sort().map((h) => `\`${h}\``).join(", ") || "none"}`);
    log(`- cart query keys: ${[...new URLSearchParams(s.cartQuery).keys()].join(", ") || "none"}`);
    for (const mode of ["quick", "all"] as Mode[]) {
      const f = s.filters[mode];
      log(`- ${MODE_NAME[mode]} filter: ${f === undefined ? "not seen" : f === "" ? "(empty)" : `\`${safeFilter(f)}\``}`);
    }
    if (tab.missing.length) log(`- still missing: ${tab.missing.join("; ")}`);
    const hq = s.modeHeaders?.quick;
    const ha = s.modeHeaders?.all;
    if (hq && ha) {
      const diff = changed(new Map(Object.entries(hq).map(([k, v]) => [k, hash(v)])), new Map(Object.entries(ha).map(([k, v]) => [k, hash(v)])));
      log(`- headers that differ between Quick and Shop all searches: ${diff.map((h) => `\`${h}\``).join(", ") || "none"}`);
      for (const h of diff) {
        for (const [mode, hs] of [["Quick", hq], ["Shop all", ha]] as const) {
          const o = hs[h] === undefined ? "(absent)" : headerOutline(hs[h]);
          if (o) log(`  - \`${h}\` in ${mode}:\n\`\`\`\n${o}\n\`\`\``);
        }
      }
    }
    log(`- cookies changed by switching to Quick: ${changed(before.cookies, afterQuick.cookies).join(", ") || "none"}`);
    log(`- cookies changed by switching to Shop all: ${changed(afterQuick.cookies, afterAll.cookies).join(", ") || "none"}`);
    log(`- site storage keys changed by switching to Shop all: ${changed(afterQuick.storage, afterAll.storage).join(", ") || "none"}`);

    const client = new JioMartClient(tab.fetcher, s);
    log("\n## Cart (read)");
    const cart = await client.cart();
    log(`- ${cart.lines.length} lines, total ₹${cart.total ?? "?"}`);

    log("\n## Searches");
    for (const mode of ["quick", "all"] as Mode[]) {
      if (s.filters[mode] === undefined) {
        log(`\n### ${MODE_NAME[mode]}: skipped (filter not seen)`);
        continue;
      }
      log(`\n### ${MODE_NAME[mode]}`);
      for (const q of QUERIES[mode]) {
        try {
          const { products, total } = await client.search(q, mode, 12);
          log(`- **${q}**: ${products.length} read of ${total ?? "?"}; ${products.filter((p) => p.sellable).length} sellable`);
          for (const p of products.slice(0, 3)) log(`  - ${describe(p)}`);
        } catch (e) {
          log(`- **${q}**: ❌ ${(e as Error).message}`);
        }
      }
    }
    if (s.filters.quick !== undefined) {
      const { products } = await client.search("atta", "quick", 40);
      log(`\nPaging: "atta" asked for 40 → got ${products.length} (${new Set(products.map((p) => p.uid)).size} distinct)`);
    }

    if (values.cart) {
      log("\n## Cart writes");
      for (const mode of ["quick", "all"] as Mode[]) {
        if (s.filters[mode] === undefined) continue;
        const { products } = await client.search(CART_QUERY[mode], mode, 12);
        const current = await client.cart();
        const p = products.find((x) => x.sellable && !current.lines.some((l) => l.uid === x.uid));
        if (!p) {
          log(`- ${MODE_NAME[mode]}: no sellable product outside your cart for "${CART_QUERY[mode]}"`);
          continue;
        }
        const answer = await rl.question(`\n${MODE_NAME[mode]}: add 1 × "${p.name}" to your real cart and remove it again? Type yes: `);
        if (answer.trim().toLowerCase() !== "yes") {
          log(`- ${MODE_NAME[mode]}: skipped by you`);
          continue;
        }
        try {
          await client.add(current.id, p, 1);
          const line = (await client.cart()).lines.find((l) => l.uid === p.uid);
          log(`- ${line?.quantity === 1 ? "✅" : "❌"} ${MODE_NAME[mode]} add "${p.name}": cart has ${line?.quantity ?? 0}${line?.journey ? ` (journey ${line.journey})` : ""}`);
          if (line) {
            await client.setQuantity(current.id, line, 2, mode);
            const two = (await client.cart()).lines.find((l) => l.uid === p.uid);
            log(`- ${two?.quantity === 2 ? "✅" : "❌"} change to 2: cart has ${two?.quantity ?? 0}`);
            await client.remove(current.id, two ?? line, mode);
          }
          const gone = !(await client.cart()).lines.some((l) => l.uid === p.uid);
          log(`- ${gone ? "✅ removed again" : `❌ still in cart: remove "${p.name}" by hand`}`);
        } catch (e) {
          const code = e instanceof CartError || e instanceof ShopError ? e.code : "error";
          log(`- ❌ ${MODE_NAME[mode]}: ${code}: ${(e as Error).message}. Check the cart for "${p.name}".`);
        }
      }
    }
    tab.close();
    log(`\nShare ${report}.`);
  } finally {
    rl.close();
    await browser.close().catch(() => undefined);
  }
}

await main();

// End-to-end check of Phases 1–2 against the JioMart stand-in (no network): parse a list, attach to the tab the
// way the app will (headers, cart query and both modes' filters learnt from the page's own traffic), search in
// Quick and Shop all, then add / change / remove through the client and check the shop's cart after each step.
//
//   ./instruction.sh e2e        (CHROMIUM_EXECUTABLE=/path/to/chrome to pick the browser)

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JioMartClient, ShopError } from "../../src/engine/jiomart/client.ts";
import { parseList } from "../../src/engine/list.ts";
import { openJioMartTab } from "../../src/local/jiomart-tab.ts";
import { connect } from "../../src/research/cdp.ts";
import { startFakeJioMart } from "./fake-jiomart.ts";

function findChromium(): string {
  if (process.env.CHROMIUM_EXECUTABLE) return process.env.CHROMIUM_EXECUTABLE;
  const root = "/opt/pw-browsers";
  if (existsSync(root)) {
    for (const d of readdirSync(root).filter((d) => /^chromium-\d+$/.test(d))) {
      const p = join(root, d, "chrome-linux64", "chrome");
      if (existsSync(p)) return p;
    }
  }
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium"]) {
    if (existsSync(p)) return p;
  }
  throw new Error("No Chromium found. Set CHROMIUM_EXECUTABLE.");
}

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
}

const PORT = 9334;
const endpoint = `http://127.0.0.1:${PORT}`;
const jm = await startFakeJioMart();
const tmp = mkdtempSync(join(tmpdir(), "grocery-cart-engine-e2e-"));
process.env.GROCERY_CART_STATE = join(tmp, "state.json");
process.env.GROCERY_CART_HOME = join(tmp, "config");
const chrome = spawn(
  findChromium(),
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, "profile")}`, "--headless=new", "--no-first-run", "--no-sandbox", `${jm.origin}/`],
  { stdio: "ignore" },
);

try {
  for (let i = 0; i < 50; i++) {
    if (await fetch(`${endpoint}/json/version`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  // Phase 1: the list.
  const list = parseList(readFileSync(new URL("../../examples/my-list.txt", import.meta.url), "utf8"));
  check(list.items.length === 65 && list.errors.length === 0, "example list parses (65 items, no errors)");

  // Attach and learn the session from the page.
  const { browser, context } = await connect(endpoint);
  const site = { id: "jiomart", name: "JioMart stand-in", startUrl: `${jm.origin}/`, domains: ["127.0.0.1"] };
  const tab = await openJioMartTab(context, { site, origin: jm.origin, waitMs: 3000 });
  check(tab.session.headers.authorization === jm.auth, "headers learnt from the page's own cart polling");
  check(!("x-fp-signature" in tab.session.headers), "copied headers leave out the stale signature");
  check(tab.session.cartQuery === "area_code=000000&b=true&i=true", "cart query learnt from the page");
  check(tab.missing.length === 2 && tab.missing.every((m) => /search filter/.test(m)), "only the two search filters are missing before any search");

  // The user searches once in each mode on the site.
  const { page } = tab;
  await page.click("#quick");
  await page.fill("#q", "rice");
  await page.click("#go");
  await page.waitForTimeout(500);
  await page.click("#all");
  await page.click("#go");
  await page.waitForTimeout(500);
  check(tab.session.filters.quick === "journey:quickcommerce:::store_ids:13895||13895", "Quick filter learnt from the page's search");
  check(tab.session.filters.all === "", "Shop all learnt as an unfiltered search");
  check(tab.storeId === "13895", "store id read from the Quick filter");
  check(tab.session.modeHeaders?.all?.["x-location-detail"] === "loc-all", "Shop all's own headers kept");
  check(tab.missing.length === 0, "nothing missing after one search per mode");
  const saved = JSON.parse(readFileSync(process.env.GROCERY_CART_STATE!, "utf8"));
  check(saved["000000"]?.quick?.includes("13895") && saved["000000"]?.all === "", "filters remembered per area code");

  // Search in both modes.
  const client = new JioMartClient(tab.fetcher, tab.session, { writeGapMs: 200, searchGapMs: 50 });

  // Paging: before the page has shown how it asks for page 2, a repeated first page stops the search;
  // after you "scroll" once on the site, the tool pages the same way.
  const before = await client.search("a", "all", 40);
  check(before.products.length === 2, `without learnt paging, a repeated page stops the search (${before.products.length})`);
  await page.fill("#q", "a");
  await page.click("#go");
  await page.waitForTimeout(300);
  await page.click("#more");
  await page.waitForTimeout(500);
  check(
    tab.session.paging?.idFrom === "meta.nextPageToken" && tab.session.paging.params.page_type === "cursor",
    `paging learnt from the page's own page-2 request (${JSON.stringify(tab.session.paging)})`,
  );
  const after = await client.search("a", "all", 40);
  check(after.products.length > 2 && new Set(after.products.map((p) => p.uid)).size === after.products.length, `with learnt paging: ${after.products.length} distinct products`);
  const quickCooker = await client.search("pressure cooker", "quick");
  const allCooker = await client.search("pressure cooker", "all");
  check(quickCooker.products.length === 0, "Quick finds no pressure cooker (kitchenware isn't quick)");
  check(allCooker.products[0]?.name === "Hawkins Pressure Cooker 5 L" && allCooker.products[0].mode === "all", "Shop all finds it");
  const dal = await client.search("toor dal", "quick");
  check(dal.products.length === 2 && dal.products[1].sellable && !dal.products[0].sellable, "Quick search reads sellable and unsellable products");

  // Cart: add (each mode), change, remove; the shop's cart is the judge.
  const cart = await client.cart();
  const tata = dal.products[1];
  await client.add(cart.id, tata, 1);
  await client.add(cart.id, allCooker.products[0], 1);
  check(jm.cart.get(tata.uid)?.quantity === 1 && jm.cart.get(9100001)?.quantity === 1, "added one item from each mode");
  check(jm.writes[1]?.location === "loc-all", "the Shop all add went out with Shop all's headers");
  check(jm.writes.every((w) => !w.signed), "writes go out without a signature");
  let lines = (await client.cart()).lines;
  const tataLine = lines.find((l) => l.uid === tata.uid)!;
  check(tataLine.journey === "quickcommerce" && lines.find((l) => l.uid === 9100001)?.journey === "standard", "cart shows each line's delivery");
  await client.setQuantity(cart.id, tataLine, 3);
  check(jm.cart.get(tata.uid)?.quantity === 3, "quantity changed to 3");
  const limit = await client.add(cart.id, tata, 2).catch((e: unknown) => e);
  check((limit as { code?: string }).code === "qty_limit", "going over the order limit is reported as qty_limit");
  lines = (await client.cart()).lines;
  for (const line of lines) await client.remove(cart.id, line);
  check(jm.cart.size === 0, "removed everything again");

  // A lost session is reported as signed_out.
  const broken = new JioMartClient(tab.fetcher, { ...tab.session, headers: {} });
  const err = await broken.cart().catch((e: unknown) => e);
  check(err instanceof ShopError && err.code === "signed_out", "missing auth is reported as signed_out");

  tab.close();
  await browser.close();
} finally {
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await exited;
  await jm.close();
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll engine e2e checks passed");
process.exit(failures ? 1 : 0);

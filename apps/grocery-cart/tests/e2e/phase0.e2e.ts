// End-to-end check of the Phase 0 tools against a stand-in shop (no network): starts Chromium the way
// `./instruction.sh chrome` starts Chrome (own profile, remote debugging), attaches over CDP, records a scripted
// search + add + "+" + remove, writes summary.md, replays the search with new words (with and without the custom
// header) and the add-to-cart, and checks your Chrome survives the tools disconnecting.
//
//   ./instruction.sh e2e        (CHROMIUM_EXECUTABLE=/path/to/chrome to pick the browser)

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCapture } from "../../src/research/capture.ts";
import { connect, sitePage } from "../../src/research/cdp.ts";
import { addCandidate, searchCandidates } from "../../src/research/classify.ts";
import { formatSearchProbe, probeSearch, replay, replayHeaders } from "../../src/research/probe.ts";
import { startRecording } from "../../src/research/recorder.ts";
import type { Site } from "../../src/research/sites.ts";
import { writeSummary } from "../../src/research/summarize.ts";
import { SESSION, SHOP_TOKEN, startFakeShop } from "./fake-shop.ts";

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

const PORT = 9333;
const endpoint = `http://127.0.0.1:${PORT}`;
const shop = await startFakeShop();
const profile = mkdtempSync(join(tmpdir(), "grocery-cart-e2e-profile-"));
const outRoot = mkdtempSync(join(tmpdir(), "grocery-cart-e2e-captures-"));
const chrome = spawn(
  findChromium(),
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--no-sandbox", "about:blank"],
  { stdio: "ignore" },
);

async function chromeAlive(): Promise<boolean> {
  try {
    return (await fetch(`${endpoint}/json/version`)).ok;
  } catch {
    return false;
  }
}

try {
  for (let i = 0; i < 50 && !(await chromeAlive()); i++) await new Promise((r) => setTimeout(r, 200));
  const site: Site = { id: "testshop", name: "Test Shop", startUrl: `${shop.origin}/`, domains: ["127.0.0.1"] };

  // Record, driving the page the way a person would.
  const { browser, context } = await connect(endpoint);
  const page = await sitePage(context, site);
  const rec = startRecording(context, site, join(outRoot, "testshop-run"));
  rec.mark("setup");
  rec.mark("search", { term: "atta" });
  await page.fill("#q", "atta");
  await page.click("#go");
  await page.waitForSelector("li .name");
  rec.mark("scroll");
  const product = "Aashirvaad Select Atta 5 kg";
  rec.mark("add", { product });
  const row = page.locator("li", { hasText: product });
  await row.locator(".add").click();
  await page.waitForFunction(() => document.getElementById("count")?.textContent === "1");
  rec.mark("increase");
  await row.locator(".plus").click();
  await page.waitForFunction(() => document.getElementById("count")?.textContent === "2");
  rec.mark("remove");
  await row.locator(".remove").click();
  await page.waitForFunction(() => document.getElementById("count")?.textContent === "0");
  await rec.stop();

  // Summary: finds the right requests and leaks nothing.
  const summary = readFileSync(writeSummary(rec.dir), "utf8");
  const capture = loadCapture(rec.dir);
  const shopCalls = capture.requests.filter((r) => r.siteHost).map((r) => `${r.step} ${new URL(r.url).pathname}`);
  check(
    shopCalls.join(",") === "search /api/search,add /api/cart/add,increase /api/cart/update,remove /api/cart/remove",
    `recorded each shop call under its step (${shopCalls.join(", ")})`,
  );
  check(capture.requests.some((r) => !r.siteHost && r.url.includes("/track") && !r.reqHeaders), "other hosts recorded by URL only");
  const best = searchCandidates(capture)[0];
  check(!!best && new URL(best.req.url).pathname === "/api/search", "top search candidate is /api/search");
  check(best?.productPaths.some((p) => /^data\.products\[\d+\]\.display_name$/.test(p)) ?? false, "product name located in the search response");
  check(new URL(addCandidate(capture)?.url ?? "http://x/").pathname === "/api/cart/add", "add candidate is /api/cart/add");
  check(summary.includes("`x-shop-token`"), "summary names the custom header");
  check(summary.includes("pincode=‹redacted›"), "summary redacts the pincode");
  for (const secret of [SHOP_TOKEN, SESSION, "9876543210", "Asha Verma", "asha@example.com", "MG Road", "560001"]) {
    check(!summary.includes(secret), `summary does not contain ${secret.slice(0, 12)}…`);
  }
  check(readFileSync(join(rec.dir, "raw.jsonl"), "utf8").includes(SESSION), "raw capture keeps the cookie for replay");

  // Probe: replay the search with new words, from inside the page.
  const probe = await probeSearch(page, best!.req, "atta", "toor dal");
  const [withHeaders, withoutHeaders] = probe.attempts;
  check(withHeaders?.result.status === 200 && withHeaders.products?.count === 2, "search replay with custom headers returns the 2 toor dal products");
  check(withHeaders?.products?.names.every((n) => /toor dal/i.test(n)) ?? false, "replayed results are for the new words");
  check(withoutHeaders?.result.status === 401, "search replay without custom headers is refused (header needed)");
  console.log(`\n${formatSearchProbe(probe)}`);

  // Probe --add: replaying the captured add puts the product back in the cart.
  const add = addCandidate(capture)!;
  const res = await replay(page, { url: add.url, method: add.method, headers: replayHeaders(add, true), body: add.reqBody });
  check(res.status === 200 && shop.cart.get(102) === 1, "add-to-cart replay changes the cart");

  // Disconnecting must not close the user's Chrome or its tabs.
  await browser.close();
  check(await chromeAlive(), "Chrome still running after the tools disconnect");
  const tabs = (await (await fetch(`${endpoint}/json/list`)).json()) as { url: string }[];
  check(tabs.some((t) => t.url.startsWith(shop.origin)), "shop tab still open after disconnect");
} finally {
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await exited;
  await shop.close();
  rmSync(profile, { recursive: true, force: true });
  rmSync(outRoot, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll e2e checks passed");
process.exit(failures ? 1 : 0);

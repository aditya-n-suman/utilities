// Phase 0 recorder: attaches to your Chrome, walks you through one search and one add-to-cart by hand, and
// records what the shop's page sends at each step. Writes captures/<site>-<stamp>/ and its summary.md.
//
//   ./instruction.sh chrome            (once; leave that Chrome open)
//   ./instruction.sh record [jiomart]

import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { connect, DEFAULT_ENDPOINT, sitePage } from "./cdp.ts";
import { captureDirName, startRecording } from "./recorder.ts";
import { getSite } from "./sites.ts";
import { writeSummary } from "./summarize.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { endpoint: { type: "string", default: DEFAULT_ENDPOINT } },
});
const site = getSite(positionals[0] ?? "jiomart");
const rl = createInterface({ input: process.stdin, output: process.stdout });

const say = (s: string) => console.log(`\n${s}`);
const enter = (s: string) => rl.question(`\n${s}\n  Press Enter when done… `);
async function askNonEmpty(q: string): Promise<string> {
  for (;;) {
    const a = (await rl.question(`\n${q} `)).trim();
    if (a) return a;
  }
}

const { browser, context } = await connect(values.endpoint);
const page = await sitePage(context, site);
await page.bringToFront();
const rec = startRecording(context, site, join("captures", captureDirName(site)));
let finished = false;

async function finish(): Promise<void> {
  if (finished) return;
  finished = true;
  const { requests, siteRequests } = await rec.stop();
  const summary = writeSummary(rec.dir);
  say(`Recorded ${requests} requests (${siteRequests} to ${site.name}).`);
  say(`Share this file (it is redacted; skim it first):\n  ${summary}`);
  say(`Keep the rest of ${rec.dir}/ to yourself: raw.jsonl has your cookies. Next: ./instruction.sh probe`);
  rl.close();
  await browser.close().catch(() => undefined); // disconnects; your Chrome stays open
}
process.on("SIGINT", () => void finish().then(() => process.exit(0)));

say(`Recording ${site.name} in your Chrome (${values.endpoint}) to ${rec.dir}/`);
say("Do each step in that Chrome window, at your normal pace, then come back here.");

rec.mark("setup");
await enter(`1/7  Sign in to ${site.name} and set your delivery pincode, so the home page shows it.`);

const term = await askNonEmpty("2/7  Type a common item you will search for (e.g. atta), then press Enter:");
rec.mark("search", { term });
await enter(`     Now search for "${term}" in ${site.name}'s search box and wait for the results.`);

rec.mark("scroll");
await enter("3/7  Scroll down the results until more products load (or to the end).");

const product = await askNonEmpty(
  "4/7  Pick one product from the results and type (or paste) its name exactly as shown, then press Enter:",
);
rec.mark("add", { product });
await enter(`     Click "Add" on "${product}" and wait until the cart count changes.`);

rec.mark("increase");
await enter("5/7  Click + once on the same product (quantity 2).");

rec.mark("cart");
await enter("6/7  Open the cart page.");

rec.mark("remove");
await enter("7/7  Remove that product from the cart (or bring it to 0).");

for (;;) {
  const label = (await rl.question("\nAnything else to record? Type a short label and press Enter, or just press Enter to finish: ")).trim();
  if (!label) break;
  rec.mark(label.replace(/\s+/g, "-").toLowerCase());
  await enter(`     Do "${label}" now.`);
}

await finish();

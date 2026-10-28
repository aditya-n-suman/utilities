// End-to-end check of the local app (server + UI) against the JioMart stand-in, no network:
// a "user's Chrome" with the shop tab (remote debugging), the app server attached to it, and a second browser
// driving the UI through Connect → Paste list → Finding → Review (edits) → Adding → Done → Remembered.
//
//   ./instruction.sh e2e                (builds the UI first)
//   SHOTS=/some/dir ./instruction.sh e2e   also saves screenshots of each screen, light and dark

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { startServer } from "../../src/local/server.ts";
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

const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

const LIST = `Atta ; 5 kg ; आटा
Toor dal ; 2 kg ; तूर दाल
Mustard oil ; 5 L ; सरसों तेल
Jeera ; 100 g ; जीरा
Pressure cooker 5 L ; x1 ; प्रेशर कुकर
Container 1 kg ; x6 ; डब्बा
Hing ; 50 g ; हींग
Oil ; 5 tbsp`;

const PORT = 9335;
const jm = await startFakeJioMart();
const tmp = mkdtempSync(join(tmpdir(), "grocery-cart-ui-e2e-"));
process.env.GROCERY_CART_HOME = join(tmp, "config");
const exe = findChromium();
const userChrome = spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmp, "profile")}`, "--headless=new", "--no-first-run", "--no-sandbox", `${jm.origin}/`], {
  stdio: "ignore",
});

const uiBrowser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
try {
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const site = { id: "jiomart", name: "JioMart stand-in", startUrl: `${jm.origin}/`, domains: ["127.0.0.1"] };
  const { url, server, app } = await startServer(0, {
    endpoint: `http://127.0.0.1:${PORT}`,
    site,
    origin: jm.origin,
    clientOptions: { writeGapMs: 150, searchGapMs: 150 },
  });

  for (const scheme of ["light", "dark"] as const) {
    const ctx = await uiBrowser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const ui = await ctx.newPage();
    const errors: string[] = [];
    ui.on("pageerror", (e) => errors.push(e.message));
    ui.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await ui.goto(url);

    if (scheme === "light") {
      // 1. Connect: Chrome, sign-in and pincode come from the shop tab; the modes need one search each.
      await ui.getByText("Delivering to").waitFor();
      check(await ui.getByText("000000").isVisible(), "connect shows the pincode from the shop tab");
      check(await ui.getByText(/switch to Quick and search/).isVisible(), "connect asks for one search per mode");
      await shot(ui, "a1-connect-modes-missing");
      const { browser: shopBrowser, context } = await connect(`http://127.0.0.1:${PORT}`);
      const shop = context.pages().find((p) => p.url().startsWith(jm.origin))!;
      await shop.click("#quick");
      await shop.fill("#q", "rice");
      await shop.click("#go");
      await shop.click("#all");
      await shop.click("#go");
      await ui.getByText("Learnt Quick and Shop all").waitFor();
      await ui.locator(".checklist li:last-child .state-ok").waitFor();
      check(true, "both modes learnt from the shop tab's searches");
      await shopBrowser.close();
      await shot(ui, "a1-connect-ok");
      await ui.getByRole("button", { name: "Continue" }).click();
    } else {
      await ui.getByRole("button", { name: "Continue" }).click(); // a new tab starts at Connect, already all ok
    }

    // 2. Paste list.
    await ui.getByRole("heading", { name: "Your list" }).waitFor();
    await ui.getByLabel("Grocery list").fill(LIST);
    check(await ui.getByText("Line 8: unknown unit").isVisible(), "the preview shows the bad line's error");
    check((await ui.locator(".foot").innerText()).includes("7 items"), "footer counts 7 items");
    if (scheme === "light") {
      await ui.getByRole("button", { name: "Format help" }).first().click();
      await shot(ui, "a2-list");
      await ui.getByRole("button", { name: "Close format help" }).click();
    } else {
      await shot(ui, "a2-list-dark");
    }
    await ui.getByRole("radio", { name: /Quick/ }).click();
    await ui.getByRole("button", { name: "Find products" }).click();
    if (scheme === "light") {
      await ui.getByRole("heading", { name: "Finding products" }).waitFor();
      await shot(ui, "a3-finding");
    }

    // 3. Finding → 4. Review.
    await ui.getByRole("heading", { name: "Review your cart" }).waitFor({ timeout: 20000 });
    const rows = ui.locator('[aria-label="Review"] .tr');
    check((await rows.count()) === 7, "review lists the 7 lines");
    const row = (q: string) => rows.filter({ has: ui.locator(".yours .name", { hasText: new RegExp(`^${q}$`) }) });
    check((await row("Atta").innerText()).includes("Good match"), "Atta is a good match");
    check((await row("Toor dal").innerText()).includes("Tata Sampann"), "Toor dal skips the unsellable loose dal");
    check((await row("Mustard oil").innerText()).includes("1 × 5 L = 5 L"), "Mustard oil picks one 5 L pack");
    check((await row("Container 1 kg").innerText()).includes("Check this"), "6 containers over the order limit need a look");
    check((await row("Pressure cooker 5 L").innerText()).includes("Not found"), "the cooker isn't in Quick");
    if (scheme === "light") await shot(ui, "a4-review");

    await row("Pressure cooker 5 L").getByRole("button", { name: "Search Shop all for this" }).click();
    await row("Pressure cooker 5 L").getByText("Hawkins Pressure Cooker 5 L").waitFor();
    check((await row("Pressure cooker 5 L").innerText()).includes("Shop all"), "the cooker row moved to Shop all");
    await row("Hing").getByRole("button", { name: "Skip" }).click();
    await row("Hing").getByText("Skipped. It won't be added.").waitFor();
    await row("Mustard oil").getByRole("button", { name: "Change" }).click();
    if (scheme === "light") await shot(ui, "a4-review-change");
    await ui.getByRole("option", { name: /Mustard Oil 1 L/ }).click();
    await row("Mustard oil").getByText("5 × 1 L = 5 L").waitFor();
    check(await row("Mustard oil").getByText("Remember for next time").isVisible(), "a changed pick offers Remember");
    await row("Atta").getByRole("button", { name: "One pack more" }).click();
    await row("Atta").getByText("2 × 5 kg = 10 kg").waitFor();
    check(true, "the stepper re-plans Atta to 2 packs");
    const foot = await ui.locator(".foot").innerText();
    check(/6 items to add/.test(foot) && /5 Quick · 1 Shop all/.test(foot), "footer: 6 to add, split by delivery");
    if (scheme === "dark") await shot(ui, "a4-review-dark");

    // 5. Adding (with a human check on the light pass) → 6. Done.
    if (scheme === "light") {
      jm.state.humanCheckNext = true;
      // Toor dal is already in the cart once: the run increases it, and Undo must put it back to 1.
      jm.cart.set(7507147, { identifier: "pre1", article_id: "art7507147", quantity: 1, size: "1 KG", vertical: "GROCERIES", journey: "quickcommerce" });
    }
    await ui.getByRole("button", { name: /Add 6 items to JioMart cart/ }).click();
    if (scheme === "light") {
      await ui.getByText("JioMart wants to check you're human.").waitFor();
      check(await ui.getByText("Paused", { exact: true }).isVisible(), "a human check pauses adding");
      check(await ui.getByText("Adding… paused").isVisible(), "the line in progress shows Adding… paused");
      await shot(ui, "a5-adding-paused");
      await ui.getByRole("button", { name: "Resume" }).click();
    }
    await ui.getByRole("heading", { name: /of 6 added/ }).waitFor({ timeout: 20000 });
    const heading = await ui.getByRole("heading", { name: /added/ }).innerText();
    check(/6\s+of\s+6 added/.test(heading), `done: ${heading.replace(/\s+/g, " ")}`);
    if (scheme === "light") {
      const lines = [...jm.cart.entries()].map(([uid, l]) => `${uid}:${l.quantity}`).sort();
      check(
        lines.join(",") === ["7507147:3", "7600001:2", "7600010:5", "7600020:1", "7600030:4", "9100001:1"].sort().join(","),
        `the shop's cart has what was reviewed (${lines.join(", ")})`,
      );
      check(jm.writes.filter((w) => w.path.endsWith("bulk-detail")).every((w) => !w.signed), "no stale signature sent");
    }
    check((await ui.getByText("Buy these elsewhere").count()) === 0, "nothing to buy elsewhere: the skipped line isn't listed");
    await shot(ui, scheme === "light" ? "a6-done" : "a6-done-dark");

    // Taking things out again: "Undo this run" (light), or select all + remove on the cart page (dark).
    if (scheme === "light") {
      await ui.getByRole("button", { name: "Undo this run" }).click();
      await ui.getByRole("button", { name: "Yes, undo" }).click();
      await ui.getByRole("heading", { name: "Your JioMart cart" }).waitFor();
      await ui.getByText(/^Removed\s/).waitFor({ timeout: 20000 });
      const left = [...jm.cart.entries()].map(([uid, l]) => `${uid}:${l.quantity}`);
      check(left.join(",") === "7507147:1", `undo takes back the run and restores what was there (${left.join(", ")})`);
      await ui.getByText("1 line · ₹179").waitFor();
      check((await ui.getByRole("tab", { name: /Added by Grocery Cart/ }).innerText()).includes("0"), "after undo nothing is marked as added by Grocery Cart");
      await ui.getByRole("link", { name: "Back" }).click();
      check((await ui.getByRole("button", { name: "Undo this run" }).count()) === 0, "Undo isn't offered twice");
      await ui.getByRole("link", { name: "Your cart" }).click();
      await shot(ui, "cart-after-undo");
      await ui.getByRole("button", { name: "Dismiss" }).click();
      jm.cart.clear();
      await ui.getByRole("button", { name: "Refresh" }).click();
      await ui.getByText("Your cart is empty.").waitFor();
    } else {
      await ui.getByRole("link", { name: "Your cart" }).click();
      await ui.getByRole("heading", { name: "Your JioMart cart" }).waitFor();
      await ui.getByText("6 lines ·").waitFor();
      check((await ui.getByRole("tab", { name: /Added by Grocery Cart/ }).innerText()).includes("6"), "cart page marks the 6 lines this run added");
      await ui.getByLabel("Select all shown").check();
      await ui.getByRole("button", { name: "Remove 6 lines" }).click();
      await shot(ui, "cart-confirm-dark");
      await ui.getByRole("button", { name: "Yes, remove 6 lines" }).click();
      await ui.getByText("Your cart is empty.").waitFor({ timeout: 20000 });
      check(jm.cart.size === 0, "select all + remove empties the cart");
      await ui.getByRole("link", { name: "Back" }).click();
    }

    // 7. Remembered choices.
    await ui.getByRole("link", { name: "Remembered choices" }).click();
    await ui.getByRole("heading", { name: "Remembered choices" }).waitFor();
    check(await ui.getByText("Fortune Kachi Ghani Mustard Oil 1 L").isVisible(), "the changed pick is remembered");
    await ui.getByRole("button", { name: "Change product for mustard oil" }).click();
    await ui.getByRole("search").getByRole("button", { name: "Search" }).click();
    await ui.getByRole("option", { name: /Mustard Oil 5 L/ }).waitFor();
    if (scheme === "light") await shot(ui, "a7-remembered-change");
    await ui.getByRole("option", { name: /Mustard Oil 5 L/ }).click();
    await ui.getByRole("listbox").waitFor({ state: "detached" });
    const saved = await ui.getByRole("table", { name: "Remembered choices" }).getByRole("row").nth(1).innerText();
    check(saved.includes("Mustard Oil 5 L") && saved.includes("₹849"), "Change saves the picked product and closes");
    if (scheme === "light") await shot(ui, "a7-remembered");
    await ui.getByRole("button", { name: "Forget mustard oil" }).click();
    await ui.getByText("Nothing remembered yet").waitFor();
    check(true, "forget removes it");

    // Back for the next pass.
    await ui.getByRole("link", { name: "Back" }).click();
    await ui.getByRole("button", { name: "New list" }).click();
    jm.cart.clear();
    check(errors.length === 0, `no page errors (${scheme})${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await ctx.close();
  }

  // Adding pauses on a lost session and resumes.
  check(readFileSync(join(process.env.GROCERY_CART_HOME!, "last-list.txt"), "utf8") === LIST, "the last list is saved");
  app.close();
  server.close();
} finally {
  await uiBrowser.close();
  const exited = new Promise((r) => userChrome.once("exit", r));
  userChrome.kill();
  await exited;
  await jm.close();
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll UI e2e checks passed");
process.exit(failures ? 1 : 0);

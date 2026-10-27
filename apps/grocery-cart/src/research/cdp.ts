// Attaching to your own Chrome over the DevTools protocol. Chrome must have been started with
// --remote-debugging-port and its own --user-data-dir (Chrome 136+ refuses the port on the default profile);
// `./instruction.sh chrome` does that. Nothing here launches a browser or touches your normal profile.

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { isSiteHost, type Site } from "./sites.ts";

export const DEFAULT_ENDPOINT = "http://127.0.0.1:9222";

export async function connect(endpoint = DEFAULT_ENDPOINT): Promise<{ browser: Browser; context: BrowserContext }> {
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(endpoint);
  } catch (e) {
    throw new Error(
      `Can't reach Chrome at ${endpoint}. Start it with "./instruction.sh chrome" and keep it open.\n(${(e as Error).message.split("\n")[0]})`,
    );
  }
  const context = browser.contexts()[0];
  if (!context) throw new Error("Chrome has no browser context. Open a normal (not incognito) window.");
  return { browser, context };
}

/** A tab on the shop, opening one if none is there. */
export async function sitePage(context: BrowserContext, site: Site): Promise<Page> {
  const existing = context.pages().find((p) => {
    try {
      return isSiteHost(site, new URL(p.url()).hostname);
    } catch {
      return false;
    }
  });
  if (existing) return existing;
  const page = await context.newPage();
  await page.goto(site.startUrl, { waitUntil: "domcontentloaded" });
  return page;
}

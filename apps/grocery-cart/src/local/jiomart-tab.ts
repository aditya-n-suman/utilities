// Connects the JioMart client to your signed-in JioMart tab in the tool's Chrome (see SETUP.md).
// Nothing is copied from a saved recording: the page's own live requests supply what the client needs.
// - headers: from any JioMart API call the page makes (it polls the cart constantly; a reload makes it call again);
// - cart query: from the page's cart-detail call (it carries your area code);
// - search filter per mode: from the page's own searches, remembered per area code in ~/.config/grocery-cart/.
// Requests then go out with fetch() inside the tab: your cookies, JioMart's origin, nothing stored by us.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BrowserContext, Page, Request } from "playwright-core";
import { CART_DETAIL_PATH, type Mode, ORIGIN, SEARCH_PATH, storeFromFilter } from "../engine/jiomart/api.ts";
import type { Fetcher, FetchRequest, FetchResponse, Session } from "../engine/jiomart/client.ts";
import { sitePage } from "../research/cdp.ts";
import { type Site, SITES } from "../research/sites.ts";
import { resendableHeaders } from "./headers.ts";

const stateFile = () => process.env.GROCERY_CART_STATE ?? join(homedir(), ".config", "grocery-cart", "jiomart.json");

interface SavedFilters {
  /** area code → mode → filter */
  [areaCode: string]: Partial<Record<Mode, string>>;
}

function loadSaved(): SavedFilters {
  try {
    return JSON.parse(readFileSync(stateFile(), "utf8")) as SavedFilters;
  } catch {
    return {};
  }
}

function save(saved: SavedFilters): void {
  mkdirSync(dirname(stateFile()), { recursive: true });
  writeFileSync(stateFile(), JSON.stringify(saved, null, 2));
}

/**
 * Headers to send again. The page signs each call (x-fp-signature over that call, with x-fp-date); a copied signature
 * would be stale, and Phase 0b showed cart writes work without one, so they are dropped.
 */
export function pageHeaders(headers: Record<string, string>): Record<string, string> {
  const out = resendableHeaders(headers);
  delete out["x-fp-signature"];
  delete out["x-fp-date"];
  return out;
}

/** Which mode a filter the page sent belongs to. Shop all's exact form is still to be confirmed. */
export function modeOfFilter(f: string): Mode {
  return /journey:quickcommerce/i.test(f) ? "quick" : "all";
}

export interface Observed {
  headers?: Record<string, string>;
  cartQuery?: string;
  filters: Partial<Record<Mode, string>>;
  modeHeaders: Partial<Record<Mode, Record<string, string>>>;
}

/** Folds one of the page's requests into what we've learnt. Exported for tests. */
export function observe(o: Observed, url: string, headers: Record<string, string>, origin = ORIGIN): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.origin !== origin || !/^\/(api\/service\/application|ext)\//.test(u.pathname)) return;
  if (headers.authorization) o.headers = pageHeaders(headers);
  if (u.pathname === CART_DETAIL_PATH && u.search) o.cartQuery = u.search.slice(1);
  if (u.pathname === SEARCH_PATH) {
    // No `f` at all counts as an unfiltered search, which can only be Shop all.
    const f = u.searchParams.get("f") ?? "";
    const mode = modeOfFilter(f);
    o.filters[mode] = f;
    if (headers.authorization) o.modeHeaders[mode] = pageHeaders(headers);
  }
}

export function areaCode(cartQuery: string | undefined): string {
  return new URLSearchParams(cartQuery ?? "").get("area_code") ?? "unknown";
}

export function pageFetcher(page: Page): Fetcher {
  return async (req: FetchRequest): Promise<FetchResponse> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await page.evaluate(async ({ url, method, headers, body }) => {
          try {
            const res = await fetch(url, { method, headers, body, credentials: "include" });
            return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: await res.text() };
          } catch (e) {
            return { status: 0, contentType: "", body: "", error: String(e) };
          }
        }, req);
      } catch (e) {
        // The page navigated mid-call (you clicked something). Wait for it to settle and try once more.
        if (attempt > 0) return { status: 0, contentType: "", body: "", error: (e as Error).message.split("\n")[0] };
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      }
    }
  };
}

export interface JioMartTab {
  page: Page;
  fetcher: Fetcher;
  session: Session;
  /** the store in the quick filter, if known */
  storeId?: string;
  /** what's still missing, in words for the UI (updates as the page makes more requests) */
  readonly missing: string[];
  /** stop listening to the page */
  close(): void;
}

/**
 * Finds (or opens) the JioMart tab and learns the session from its traffic. Waits briefly; if the page has been
 * quiet, reloads it once. Keeps listening afterwards, so a search you do on JioMart later also teaches the filter.
 */
export async function openJioMartTab(
  context: BrowserContext,
  opts: { waitMs?: number; reload?: boolean; site?: Site; origin?: string } = {},
): Promise<JioMartTab> {
  const origin = opts.origin ?? ORIGIN;
  const page = await sitePage(context, opts.site ?? SITES.jiomart);
  const saved = loadSaved();
  const o: Observed = { filters: {}, modeHeaders: {} };
  const session: Session = { headers: {}, cartQuery: "", filters: {}, ...(origin !== ORIGIN ? { origin } : {}) };

  const sync = () => {
    if (o.headers) session.headers = o.headers;
    if (o.cartQuery) session.cartQuery = o.cartQuery;
    session.modeHeaders = o.modeHeaders;
    const area = areaCode(o.cartQuery);
    const remembered = saved[area] ?? {};
    session.filters = { ...remembered, ...o.filters };
    if (Object.keys(o.filters).length && area !== "unknown") {
      saved[area] = session.filters;
      save(saved);
    }
  };
  const onRequest = (req: Request) => {
    void req
      .allHeaders()
      .then((h) => {
        observe(o, req.url(), h, origin);
        sync();
      })
      .catch(() => undefined);
  };
  page.on("request", onRequest);

  const waitFor = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !(o.headers && o.cartQuery)) await new Promise((r) => setTimeout(r, 200));
  };
  await waitFor(opts.waitMs ?? 4000);
  if (!(o.headers && o.cartQuery) && opts.reload !== false) {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await waitFor(15000);
  }
  sync();

  const missing = (): string[] => [
    ...(o.headers ? [] : ["JioMart's request headers (is the tab signed in and loaded?)"]),
    ...(o.cartQuery ? [] : ["the cart's area code (open JioMart's home page once)"]),
    ...(session.filters.quick !== undefined ? [] : ['the Quick search filter (search for anything once on JioMart in "Quick")']),
    ...(session.filters.all !== undefined ? [] : ['the Shop all search filter (search for anything once on JioMart in "Shop all")']),
  ];

  return {
    page,
    fetcher: pageFetcher(page),
    session,
    get storeId() {
      return session.filters.quick ? storeFromFilter(session.filters.quick) : undefined;
    },
    get missing() {
      return missing();
    },
    close: () => page.off("request", onRequest),
  };
}

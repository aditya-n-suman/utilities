// Connects the JioMart client to your signed-in JioMart tab in the tool's Chrome (see SETUP.md).
// Nothing is copied from a saved recording: the page's own live requests supply what the client needs.
// - headers: from any JioMart API call the page makes (it polls the cart constantly; a reload makes it call again);
// - cart query: from the page's cart-detail call (it carries your area code);
// - search filter per mode: from the page's own searches, remembered per area code in ~/.config/grocery-cart/.
// Requests then go out with fetch() inside the tab: your cookies, JioMart's origin, nothing stored by us.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrowserContext, Page, Request, Response } from "playwright-core";
import {
  ADD_PATH,
  type AddTemplate,
  addTemplateFrom,
  CART_DETAIL_PATH,
  type Mode,
  ORIGIN,
  type Paging,
  pathOfValue,
  SEARCH_PATH,
  storeFromFilter,
} from "../engine/jiomart/api.ts";
import type { Fetcher, FetchRequest, FetchResponse, Session } from "../engine/jiomart/client.ts";
import { sitePage } from "../research/cdp.ts";
import { type Site, SITES } from "../research/sites.ts";
import { configDir, readConfig, writeConfig } from "./config.ts";
import { resendableHeaders } from "./headers.ts";

const stateFile = () => process.env.GROCERY_CART_STATE ?? join(configDir(), "jiomart.json");

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
  /** the page's recent search answers (newest last), to see where a later page's page_id came from */
  answers?: unknown[];
  paging?: Paging;
  /** a page-2 request whose page_id wasn't found in any recent answer (for the live-check report) */
  pagingUnmatched?: { params: string[]; idLength: number; answers: number };
  /** the mode of the page's last search: what an add on the page belongs to */
  lastMode?: Mode;
  addTemplates: Partial<Record<Mode, AddTemplate>>;
}

const MAX_ANSWERS = 20;

/** Remembers a search answer the page received. Exported for tests. */
export function observeSearchAnswer(o: Observed, url: string, json: unknown, origin = ORIGIN): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.origin !== origin || u.pathname !== SEARCH_PATH) return;
  (o.answers ??= []).push(json);
  if (o.answers.length > MAX_ANSWERS) o.answers.shift();
}

/** Folds one of the page's requests into what we've learnt. Exported for tests. */
export function observe(o: Observed, url: string, headers: Record<string, string>, origin = ORIGIN, body?: string): void {
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
    o.lastMode = mode;
    if (!u.searchParams.has("page_id")) o.filters[mode] = f;
    if (headers.authorization) o.modeHeaders[mode] = pageHeaders(headers);
    // Asking for a later page (you scrolled): learn which field of a recent answer it sent as page_id.
    const pageId = u.searchParams.get("page_id");
    if (pageId) {
      let idFrom: string | undefined;
      for (const a of [...(o.answers ?? [])].reverse()) if ((idFrom = pathOfValue(a, pageId))) break;
      const params = Object.fromEntries([...u.searchParams].filter(([k]) => k !== "f" && k !== "q" && k !== "page_id"));
      if (idFrom) {
        o.paging = { idFrom, params };
        o.pagingUnmatched = undefined;
      } else if (!o.paging) {
        o.pagingUnmatched = { params: Object.keys(params), idLength: pageId.length, answers: o.answers?.length ?? 0 };
      }
    }
  }
  // The page adding to the cart: learn what it sends besides the product, for the mode of its last search.
  if (u.pathname === ADD_PATH && body && o.lastMode) {
    try {
      const tpl = addTemplateFrom(url, JSON.parse(body));
      if (tpl) o.addTemplates[o.lastMode] = tpl;
    } catch {
      /* not JSON */
    }
  }
}

export function areaCode(cartQuery: string | undefined): string {
  return new URLSearchParams(cartQuery ?? "").get("area_code") ?? "unknown";
}

const requestKey = (method: string, url: string) => {
  try {
    return `${method} ${new URL(url).href}`;
  } catch {
    return `${method} ${url}`;
  }
};

/**
 * Sends the tool's requests with fetch() inside the tab. `own` counts the requests in flight, so the tab's
 * listener can tell them from the page's own requests and learn only from the page.
 */
export function pageFetcher(page: Page, own: Map<string, number> = new Map()): Fetcher {
  return async (req: FetchRequest): Promise<FetchResponse> => {
    const key = requestKey(req.method, req.url);
    own.set(key, (own.get(key) ?? 0) + 1);
    // Forget it a little after it's done, if the listener hasn't consumed it.
    const release = () => setTimeout(() => (own.get(key) ?? 0) > 0 && own.set(key, own.get(key)! - 1), 5000);
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await page.evaluate(async ({ url, method, headers, body }) => {
          try {
            const res = await fetch(url, { method, headers, body, credentials: "include" });
            return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: await res.text() };
          } catch (e) {
            return { status: 0, contentType: "", body: "", error: String(e) };
          }
        }, req);
        release();
        return res;
      } catch (e) {
        // The page navigated mid-call (you clicked something). Wait for it to settle and try once more.
        if (attempt > 0) {
          release();
          return { status: 0, contentType: "", body: "", error: (e as Error).message.split("\n")[0] };
        }
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
  /** what the tab has seen that isn't in the session: an unmatched page-2 request (for reports) */
  diagnostics(): { pagingUnmatched?: Observed["pagingUnmatched"]; addLearnt: Mode[] };
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
  const o: Observed = { filters: {}, modeHeaders: {}, addTemplates: {} };
  let savedPaging = readConfig<Paging | undefined>("jiomart-paging.json", undefined);
  const savedAdd = readConfig<Partial<Record<Mode, AddTemplate>>>("jiomart-add.json", {});
  const session: Session = { headers: {}, cartQuery: "", filters: {}, ...(origin !== ORIGIN ? { origin } : {}) };

  const sync = () => {
    if (o.headers) session.headers = o.headers;
    if (o.cartQuery) session.cartQuery = o.cartQuery;
    session.modeHeaders = o.modeHeaders;
    if (o.paging && JSON.stringify(o.paging) !== JSON.stringify(savedPaging)) {
      savedPaging = o.paging;
      writeConfig("jiomart-paging.json", o.paging);
    }
    session.paging = o.paging ?? savedPaging;
    if (Object.keys(o.addTemplates).length && JSON.stringify({ ...savedAdd, ...o.addTemplates }) !== JSON.stringify(savedAdd)) {
      Object.assign(savedAdd, o.addTemplates);
      writeConfig("jiomart-add.json", savedAdd);
    }
    session.addTemplates = { ...savedAdd };
    const area = areaCode(o.cartQuery);
    const remembered = saved[area] ?? {};
    session.filters = { ...remembered, ...o.filters };
    if (Object.keys(o.filters).length && area !== "unknown") {
      saved[area] = session.filters;
      save(saved);
    }
  };
  const own = new Map<string, number>();
  const onRequest = (req: Request) => {
    // The tool's own requests also run in this tab: learn only from the page's.
    const key = requestKey(req.method(), req.url());
    const mine = own.get(key) ?? 0;
    if (mine > 0) {
      own.set(key, mine - 1);
      return;
    }
    void req
      .allHeaders()
      .then((h) => {
        observe(o, req.url(), h, origin, req.postData() ?? undefined);
        sync();
      })
      .catch(() => undefined);
  };
  page.on("request", onRequest);
  const onResponse = (res: Response) => {
    if (!res.url().includes(SEARCH_PATH)) return;
    void res
      .json()
      .then((json: unknown) => observeSearchAnswer(o, res.url(), json, origin))
      .catch(() => undefined);
  };
  page.on("response", onResponse);

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
    fetcher: pageFetcher(page, own),
    session,
    get storeId() {
      return session.filters.quick ? storeFromFilter(session.filters.quick) : undefined;
    },
    diagnostics: () => ({ pagingUnmatched: o.pagingUnmatched, addLearnt: Object.keys(session.addTemplates ?? {}) as Mode[] }),
    get missing() {
      return missing();
    },
    close: () => {
      page.off("request", onRequest);
      page.off("response", onResponse);
    },
  };
}

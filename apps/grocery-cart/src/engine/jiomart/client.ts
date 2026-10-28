// The JioMart client: search, read the cart, add / change / remove, at a human pace, with JioMart's answers turned
// into the error codes the UI knows (DESIGN_BRIEF.md). It sends requests through a `Fetcher` it's given: in the
// local app that runs fetch() inside your JioMart tab; in the extension it will be the content script.

import {
  ADD_PATH,
  type AddTemplate,
  type AddedLine,
  addBody,
  addedLine,
  CART_DETAIL_PATH,
  type Cart,
  type CartLine,
  CHANGE_PATH,
  cartWriteOk,
  type Mode,
  ORIGIN,
  type Paging,
  parseCart,
  parseSearch,
  type Product,
  removeBody,
  searchUrl,
  updateBody,
  valueAt,
  writeMessage,
} from "./api.ts";

export interface FetchRequest {
  url: string;
  method: "GET" | "POST" | "PUT";
  headers: Record<string, string>;
  body?: string;
}

export interface FetchResponse {
  status: number;
  contentType: string;
  body: string;
  /** network error text, when the request didn't complete */
  error?: string;
}

export type Fetcher = (req: FetchRequest) => Promise<FetchResponse>;

/** What the client needs from your signed-in JioMart page (see src/local/jiomart-tab.ts). */
export interface Session {
  /** headers the page adds to its API calls (authorization, visitor-id, x-location-detail, …) */
  headers: Record<string, string>;
  /** the query the page uses for cart detail, e.g. "area_code=…&b=true&i=true" */
  cartQuery: string;
  /** search filter (`f`) per delivery mode, when known */
  filters: Partial<Record<Mode, string>>;
  /** JioMart's address; only tests change it */
  origin?: string;
  /** what the page's own add-to-cart carries per mode (learnt when you add something on JioMart) */
  addTemplates?: Partial<Record<Mode, AddTemplate>>;
  /** how the page asks for search page 2 (learnt when you scroll on JioMart); default: meta.nextPageToken */
  paging?: Paging;
  /** headers the page sent with its searches in each mode, if they differ from `headers` */
  modeHeaders?: Partial<Record<Mode, Record<string, string>>>;
}

export type ShopErrorCode = "signed_out" | "human_check" | "rate_limited" | "shop_changed" | "mode_unknown" | "network";

export class ShopError extends Error {
  constructor(
    readonly code: ShopErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type CartErrorCode = "out_of_stock" | "qty_limit" | "not_in_cart" | "shop_error";

export class CartError extends Error {
  constructor(
    readonly code: CartErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  /** minimum gap between cart writes */
  writeGapMs?: number;
  /** minimum gap between searches */
  searchGapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Turns a JioMart write failure message into a code the UI can explain. */
export function cartErrorCode(message: string): CartErrorCode {
  if (/out of stock|not available|unavailable|sold out/i.test(message)) return "out_of_stock";
  if (/maximum|max(imum)? quantity|limit|cannot add more/i.test(message)) return "qty_limit";
  if (/not found|failed to (remove|update)/i.test(message)) return "not_in_cart";
  return "shop_error";
}

export class JioMartClient {
  private lastWrite = -Infinity;
  private lastSearch = -Infinity;
  private readonly writeGapMs: number;
  private readonly searchGapMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  private get origin(): string {
    return this.session.origin ?? ORIGIN;
  }

  constructor(
    private readonly fetcher: Fetcher,
    readonly session: Session,
    opts: ClientOptions = {},
  ) {
    this.writeGapMs = opts.writeGapMs ?? 1500;
    this.searchGapMs = opts.searchGapMs ?? 700;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
  }

  private async pace(kind: "write" | "search"): Promise<void> {
    const last = kind === "write" ? this.lastWrite : this.lastSearch;
    const gap = kind === "write" ? this.writeGapMs : this.searchGapMs;
    const wait = last + gap - this.now();
    if (wait > 0) await this.sleep(wait);
    if (kind === "write") this.lastWrite = this.now();
    else this.lastSearch = this.now();
  }

  private async send(method: FetchRequest["method"], url: string, body?: unknown, mode?: Mode): Promise<unknown> {
    const base = (mode && this.session.modeHeaders?.[mode]) || this.session.headers;
    const headers = { ...base, ...(body === undefined ? {} : { "content-type": "application/json" }) };
    const res = await this.fetcher({ url, method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.error || res.status === 0) throw new ShopError("network", `Couldn't reach JioMart (${res.error ?? "no response"})`);
    if (res.status === 401 || res.status === 403) {
      // Akamai's bot check answers 403 with an HTML page; a lost session answers 401/403 with JSON.
      if (/html/i.test(res.contentType)) throw new ShopError("human_check", "JioMart wants to check you're human");
      throw new ShopError("signed_out", "Signed out of JioMart");
    }
    if (res.status === 429) throw new ShopError("rate_limited", "JioMart asked us to slow down");
    if (/html/i.test(res.contentType)) throw new ShopError("human_check", "JioMart answered with a web page instead of data");
    let json: unknown;
    try {
      json = JSON.parse(res.body);
    } catch {
      throw new ShopError("shop_changed", `JioMart's answer wasn't JSON (status ${res.status})`);
    }
    if (res.status >= 500) throw new ShopError("shop_changed", `JioMart error ${res.status}`);
    return json;
  }

  /** Products for `query`: the first page, then 50-item pages until `limit` products or the end. */
  async search(query: string, mode: Mode, limit = 12): Promise<{ products: Product[]; total?: number }> {
    const filter = this.session.filters[mode];
    if (filter === undefined) throw new ShopError("mode_unknown", `Don't know how to search JioMart in "${mode}" mode yet`);
    const products: Product[] = [];
    let total: number | undefined;
    let next: string | undefined;
    do {
      await this.pace("search");
      const paging = this.session.paging;
      const json = await this.send("GET", searchUrl(filter || undefined, query, next, 50, this.origin, paging?.params), undefined, mode);
      const page = parseSearch(json);
      if (!page) throw new ShopError("shop_changed", "JioMart's search answer changed shape");
      if (paging && page.next !== undefined) page.next = valueAt(json, paging.idFrom);
      // Stop when a page brings nothing new: a wrong page id makes JioMart repeat the first page.
      const seen = new Set(products.map((p) => p.uid));
      const fresh = page.products.filter((p) => !seen.has(p.uid));
      products.push(...fresh.map((p) => ({ ...p, mode })));
      total ??= page.total;
      next = fresh.length ? page.next : undefined;
    } while (next && products.length < limit);
    return { products: products.slice(0, Math.max(limit, 0)), total };
  }

  async cart(): Promise<Cart> {
    const url = `${this.origin}${CART_DETAIL_PATH}${this.session.cartQuery ? `?${this.session.cartQuery}` : ""}`;
    const cart = parseCart(await this.send("GET", url));
    if (!cart) throw new ShopError("shop_changed", "JioMart's cart answer changed shape");
    return cart;
  }

  private async write(method: "POST" | "PUT", path: string, cartId: string, body: unknown, mode?: Mode, query: Record<string, string> = {}): Promise<unknown> {
    await this.pace("write");
    const extra = Object.entries(query).map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("");
    const json = await this.send(method, `${this.origin}${path}?id=${encodeURIComponent(cartId)}${extra}`, body, mode);
    if (!cartWriteOk(200, json)) {
      const message = writeMessage(json) ?? "JioMart didn't change the cart";
      throw new CartError(cartErrorCode(message), message);
    }
    return json;
  }

  /** Adds `quantity` of a product. Returns the cart line it created or grew. */
  async add(cartId: string, product: Product, quantity: number): Promise<AddedLine> {
    const tpl = product.mode ? this.session.addTemplates?.[product.mode] : undefined;
    const json = await this.write("POST", ADD_PATH, cartId, addBody(product, quantity, tpl), product.mode, tpl?.query);
    const line = addedLine(json, product.uid);
    if (!line) throw new ShopError("shop_changed", "JioMart added the product but didn't say which cart line");
    return line;
  }

  async setQuantity(cartId: string, line: CartLine, quantity: number, mode?: Mode): Promise<void> {
    if (quantity <= 0) return this.remove(cartId, line, mode);
    await this.write("PUT", CHANGE_PATH, cartId, updateBody(line, quantity), mode);
  }

  async remove(cartId: string, line: CartLine, mode?: Mode): Promise<void> {
    await this.write("PUT", CHANGE_PATH, cartId, removeBody(line, line), mode);
  }
}

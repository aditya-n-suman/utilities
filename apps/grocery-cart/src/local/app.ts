// The local app's state and actions, between the HTTP server and the engine.
// - Connection: the tool's Chrome (CDP), the JioMart tab, sign-in, pincode (area code), which modes are learnt.
// - The run (engine/run.ts) through a Shop that always uses the current tab, so reconnecting doesn't lose a run.
// - Files in ~/.config/grocery-cart/: last list and mode, remembered choices, learnt filters (jiomart-tab.ts).

import type { Browser } from "playwright-core";
import { CART_PAGE_PATH, type CartLine, type Mode, ORIGIN, type Product, PROFILE_PATH } from "../engine/jiomart/api.ts";
import { JioMartClient, ShopError } from "../engine/jiomart/client.ts";
import { parseList } from "../engine/list.ts";
import { type Candidate, match } from "../engine/match.ts";
import { MemoryStore, type Remembered, type RememberedStore, rememberedFrom } from "../engine/remembered.ts";
import { Run, type RunState, type Shop } from "../engine/run.ts";
import { CartTidy, type TidyState, type TidyTarget } from "../engine/tidy.ts";
import { connect, DEFAULT_ENDPOINT } from "../research/cdp.ts";
import type { Site } from "../research/sites.ts";
import { readConfig, readText, writeConfig } from "./config.ts";
import { areaCode, type JioMartTab, openJioMartTab } from "./jiomart-tab.ts";

export type Check = "ok" | "problem" | "waiting";

export interface Connection {
  chrome: Check;
  signedIn: Check;
  pincode?: string;
  modes: Record<Mode, boolean>;
  /** learnt from the page: how it loads more results, and how it adds in Shop all (neither blocks anything) */
  learnt?: { paging: boolean; shopAllAdd: boolean };
  /** what's missing, in words */
  missing: string[];
}

export interface CartView {
  lines: CartLine[];
  total?: number;
  /** ISO time it was read */
  loadedAt?: string;
  loading: boolean;
  error?: string;
}

export interface AppState {
  connection: Connection;
  run: RunState;
  lastList: string;
  lastMode: Mode;
  remembered: Remembered[];
  cart: CartView;
  tidy: TidyState;
  /** products the current run added that "Undo this run" would take back */
  undoable: number;
}

class FileStore extends MemoryStore implements RememberedStore {
  constructor() {
    super(readConfig<Remembered[]>("remembered.json", []));
  }
  override set(r: Remembered): void {
    super.set(r);
    writeConfig("remembered.json", this.all());
  }
  override forget(key: string): void {
    super.forget(key);
    writeConfig("remembered.json", this.all());
  }
}

export interface AppOptions {
  endpoint?: string;
  /** tests: a stand-in shop */
  site?: Site;
  origin?: string;
  clientOptions?: ConstructorParameters<typeof JioMartClient>[2];
}

export class App {
  private browser?: Browser;
  private tab?: JioMartTab;
  private client?: JioMartClient;
  private connecting?: Promise<void>;
  private connection: Connection = { chrome: "waiting", signedIn: "waiting", modes: { quick: false, all: false }, missing: [] };
  readonly memory = new FileStore();
  readonly run: Run;
  readonly tidy: CartTidy;
  private cartView: CartView = { lines: [], loading: false };
  private listeners = new Set<(s: AppState) => void>();

  constructor(private readonly opts: AppOptions = {}) {
    const shop: Shop = {
      search: (q, mode, limit) => this.requireClient().search(q, mode, limit),
      cart: () => this.requireClient().cart(),
      add: (id, p, n) => this.requireClient().add(id, p, n),
      setQuantity: (id, line, n, mode) => this.requireClient().setQuantity(id, line, n, mode),
    };
    this.run = new Run(shop, this.memory, () => this.emit());
    this.tidy = new CartTidy(
      {
        cart: () => this.requireClient().cart(),
        setQuantity: (id, line, n) => this.requireClient().setQuantity(id, line, n),
        remove: (id, line) => this.requireClient().remove(id, line),
      },
      () => this.emit(),
    );
  }

  private requireClient(): JioMartClient {
    if (!this.client) throw new ShopError("network", "Can't reach the Grocery Cart Chrome window");
    return this.client;
  }

  get origin(): string {
    return this.opts.origin ?? ORIGIN;
  }

  state(): AppState {
    const tab = this.tab;
    if (tab) {
      this.connection.modes = { quick: tab.session.filters.quick !== undefined, all: tab.session.filters.all !== undefined };
      this.connection.missing = tab.missing;
      this.connection.learnt = { paging: !!tab.session.paging, shopAllAdd: !!tab.session.addTemplates?.all };
    }
    return {
      connection: { ...this.connection },
      run: this.run.state(),
      lastList: readText("last-list.txt"),
      lastMode: readConfig<{ mode?: Mode }>("settings.json", {}).mode ?? "quick",
      remembered: this.memory.all(),
      cart: { ...this.cartView },
      tidy: this.tidy.state(),
      undoable: this.run.undoTargets().length,
    };
  }

  /** Reads the JioMart cart for the Cart page. */
  async loadCart(): Promise<void> {
    this.cartView = { ...this.cartView, loading: true, error: undefined };
    this.emit();
    try {
      await this.check();
      const cart = await this.requireClient().cart();
      // Fall back to adding up the lines when JioMart doesn't report a total.
      const sum = Math.round(cart.lines.reduce((n, l) => n + (l.price ?? 0) * l.quantity, 0));
      this.cartView = { lines: cart.lines, total: cart.total || sum, loadedAt: new Date().toISOString(), loading: false };
    } catch (e) {
      this.cartView = { ...this.cartView, loading: false, error: (e as Error).message };
    }
    this.emit();
  }

  /** Removes (or reduces) cart lines one by one, then re-reads the cart. */
  tidyCart(targets: TidyTarget[]): void {
    if (this.tidy.state().phase === "removing" || !targets.length) return;
    void this.tidy.run(targets).then(() => {
      const failed = new Set(this.tidy.state().failed.map((f) => f.uid));
      this.run.markUndone(targets.filter((t) => !failed.has(t.uid)).map((t) => t.uid));
      return this.loadCart();
    });
  }

  async resumeTidy(): Promise<void> {
    await this.check();
    this.tidy.resume();
  }

  subscribe(f: (s: AppState) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  emit(): void {
    const s = this.state();
    for (const f of this.listeners) f(s);
  }

  /** (Re)connects to Chrome and the JioMart tab, then checks sign-in. Safe to call often. */
  async check(): Promise<Connection> {
    this.connecting ??= this.doCheck().finally(() => (this.connecting = undefined));
    await this.connecting;
    return this.connection;
  }

  private async doCheck(): Promise<void> {
    if (!this.browser?.isConnected()) {
      this.tab?.close();
      this.tab = this.client = undefined;
      try {
        const { browser, context } = await connect(this.opts.endpoint ?? DEFAULT_ENDPOINT);
        this.browser = browser;
        browser.on("disconnected", () => {
          this.browser = this.tab = this.client = undefined;
          this.connection = { ...this.connection, chrome: "problem", signedIn: "waiting" };
          this.emit();
        });
        this.tab = await openJioMartTab(context, { site: this.opts.site, origin: this.opts.origin });
        this.tab.page.on("request", () => this.emitSoon());
      } catch {
        this.connection = { chrome: "problem", signedIn: "waiting", modes: { quick: false, all: false }, missing: [] };
        this.emit();
        return;
      }
    }
    const tab = this.tab!;
    this.client = new JioMartClient(tab.fetcher, tab.session, this.opts.clientOptions);
    this.connection.chrome = "ok";
    this.connection.signedIn = await this.signedIn();
    this.connection.pincode = tab.session.cartQuery ? areaCode(tab.session.cartQuery) : undefined;
    if (this.connection.pincode === "unknown") this.connection.pincode = undefined;
    this.emit();
  }

  private emitTimer?: NodeJS.Timeout;
  /** The page's own requests can teach a mode's filter; tell the UI, at most twice a second. */
  private emitSoon(): void {
    this.emitTimer ??= setTimeout(() => {
      this.emitTimer = undefined;
      this.emit();
    }, 500);
  }

  private async signedIn(): Promise<Check> {
    const tab = this.tab;
    if (!tab || !tab.session.headers.authorization) return "problem";
    const res = await tab.fetcher({ url: `${this.origin}${PROFILE_PATH}`, method: "GET", headers: tab.session.headers });
    if (res.status === 401 || res.status === 403) return "problem";
    return res.status >= 200 && res.status < 300 ? "ok" : "waiting";
  }

  /** Shows a JioMart page in the tool's Chrome: home (to sign in or change the pincode) or the cart. */
  async open(what: "home" | "cart"): Promise<void> {
    await this.check();
    const page = this.tab?.page;
    if (!page) return;
    await page.bringToFront().catch(() => undefined);
    await page.goto(what === "cart" ? `${this.origin}${CART_PAGE_PATH}` : `${this.origin}/`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  }

  /** Parses the list, saves it as the last list, and starts finding products. */
  find(text: string, mode: Mode): { items: number; errors: number } {
    writeConfig("last-list.txt", text);
    writeConfig("settings.json", { mode });
    const { items, errors } = parseList(text);
    if (items.length) void this.run.find(items, mode);
    return { items: items.length, errors: errors.length };
  }

  private picked = new Map<number, Product>();

  /**
   * Remembered choices → Change: searches JioMart for new words and returns candidates, best first.
   * Products are kept so that `rememberProduct` can save the one picked.
   */
  async searchForRemembered(words: string, mode: Mode): Promise<Candidate[]> {
    await this.check();
    const { products } = await this.requireClient().search(words, mode, 24);
    const item = { line: 0, raw: words, query: words, qty: { kind: "count" as const, value: 1 } };
    const m = match(item, products);
    const all = [m.chosen, ...m.alternatives].filter((c): c is Candidate => !!c).slice(0, 8);
    for (const c of all) this.picked.set(c.product.uid, c.product);
    return all;
  }

  /** Saves the product picked in Remembered choices → Change for `key`. */
  rememberProduct(key: string, uid: number, today = new Date().toISOString().slice(0, 10)): boolean {
    const p = this.picked.get(uid);
    if (!p) return false;
    this.memory.set({ ...rememberedFrom(key, p, today), key });
    this.emit();
    return true;
  }

  /** Resume after a pause; reconnects first if Chrome went away. */
  async resume(): Promise<void> {
    await this.check();
    this.run.resume();
  }

  close(): void {
    this.tab?.close();
    void this.browser?.close().catch(() => undefined);
  }
}

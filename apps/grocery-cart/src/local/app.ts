// The local app's state and actions, between the HTTP server and the engine.
// - Connection: the tool's Chrome (CDP), the JioMart tab, sign-in, pincode (area code), which modes are learnt.
// - The run (engine/run.ts) through a Shop that always uses the current tab, so reconnecting doesn't lose a run.
// - Files in ~/.config/grocery-cart/: last list and mode, remembered choices, learnt filters (jiomart-tab.ts).

import type { Browser } from "playwright-core";
import { CART_PAGE_PATH, type Mode, ORIGIN, PROFILE_PATH } from "../engine/jiomart/api.ts";
import { JioMartClient, ShopError } from "../engine/jiomart/client.ts";
import { parseList } from "../engine/list.ts";
import { MemoryStore, type Remembered, type RememberedStore } from "../engine/remembered.ts";
import { Run, type RunState, type Shop } from "../engine/run.ts";
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
  /** what's missing, in words */
  missing: string[];
}

export interface AppState {
  connection: Connection;
  run: RunState;
  lastList: string;
  lastMode: Mode;
  remembered: Remembered[];
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
  private listeners = new Set<(s: AppState) => void>();

  constructor(private readonly opts: AppOptions = {}) {
    const shop: Shop = {
      search: (q, mode, limit) => this.requireClient().search(q, mode, limit),
      cart: () => this.requireClient().cart(),
      add: (id, p, n) => this.requireClient().add(id, p, n),
      setQuantity: (id, line, n, mode) => this.requireClient().setQuantity(id, line, n, mode),
    };
    this.run = new Run(shop, this.memory, () => this.emit());
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
    }
    return {
      connection: { ...this.connection },
      run: this.run.state(),
      lastList: readText("last-list.txt"),
      lastMode: readConfig<{ mode?: Mode }>("settings.json", {}).mode ?? "quick",
      remembered: this.memory.all(),
    };
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

// One run of a list: find products line by line, let the user review, then add to the cart line by line.
// This is the state the UI renders (RunState). It talks to the shop through the small `Shop` interface that
// JioMartClient implements, so tests use a fake and the extension can reuse it.
//
// Shop trouble (signed out, human check, slow down, network, shop changed) pauses the run where it is; resume()
// retries the same line. A refused cart write (out of stock, order limit) fails that line only.

import type { Cart, CartLine, Mode, Product } from "./jiomart/api.ts";
import { CartError, type CartErrorCode, ShopError, type ShopErrorCode } from "./jiomart/client.ts";
import { formatQuantity, type ListItem } from "./list.ts";
import { type Candidate, type Confidence, match, withPacks } from "./match.ts";
import { rememberedFrom, rememberKey, type RememberedStore } from "./remembered.ts";
import type { TidyTarget } from "./tidy.ts";

export interface Shop {
  search(query: string, mode: Mode, limit?: number): Promise<{ products: Product[] }>;
  cart(): Promise<Cart>;
  add(cartId: string, product: Product, quantity: number): Promise<unknown>;
  setQuantity(cartId: string, line: CartLine, quantity: number, mode?: Mode): Promise<void>;
}

export type SearchState = "pending" | "searching" | "done";
export type AddState = "none" | "waiting" | "adding" | "added" | "failed";

export interface Row {
  line: number;
  raw: string;
  query: string;
  /** words used for the search, if changed with "Search" */
  searchedFor: string;
  qtyText: string;
  note?: string;
  mode: Mode;
  search: SearchState;
  confidence: Confidence;
  chosen?: Candidate;
  alternatives: Candidate[];
  remembered: boolean;
  /** the user picked a different product */
  changed: boolean;
  /** remember the user's pick for next time */
  remember: boolean;
  skipped: boolean;
  add: AddState;
  addError?: CartErrorCode | ShopErrorCode;
  addMessage?: string;
  /** once added: the product added and how many of it the cart had before (for "Undo this run") */
  addedUid?: number;
  /** packs actually added when JioMart had fewer in stock than asked (otherwise the chosen packs) */
  addedPacks?: number;
  before?: number;
  /** taken back out of the cart afterwards ("Undo this run" or the Cart page) */
  undone?: boolean;
}

export type Phase = "idle" | "finding" | "review" | "adding" | "done";

export interface Pause {
  /** "user": the Pause button */
  code: ShopErrorCode | "user";
  message: string;
  /** what was running when it paused */
  during: "finding" | "adding";
}

export interface Counts {
  total: number;
  searched: number;
  high: number;
  check: number;
  notFound: number;
  skipped: number;
  ready: number;
  toAdd: number;
  added: number;
  failed: number;
  estimatedTotal: number;
}

export interface RunState {
  phase: Phase;
  mode: Mode;
  rows: Row[];
  paused?: Pause;
  counts: Counts;
}

export interface RunOptions {
  /** products read per search (first page is 12) */
  searchLimit?: number;
  today?: () => string;
}

const isoToday = () => new Date().toISOString().slice(0, 10);

export function countsOf(rows: Row[]): Counts {
  const live = rows.filter((r) => !r.skipped);
  const withProduct = live.filter((r) => r.chosen && r.search === "done");
  return {
    total: rows.length,
    searched: rows.filter((r) => r.search === "done").length,
    high: withProduct.filter((r) => r.confidence === "high").length,
    check: withProduct.filter((r) => r.confidence === "medium" || r.confidence === "low").length,
    notFound: live.filter((r) => r.search === "done" && !r.chosen).length,
    skipped: rows.filter((r) => r.skipped).length,
    ready: withProduct.filter((r) => r.confidence === "high").length,
    toAdd: withProduct.length,
    added: rows.filter((r) => r.add === "added").length,
    failed: rows.filter((r) => r.add === "failed").length,
    estimatedTotal: Math.round(withProduct.reduce((n, r) => n + (r.chosen?.lineTotal ?? 0), 0)),
  };
}

export class Run {
  private rows: Row[] = [];
  private items = new Map<number, ListItem>();
  private phase: Phase = "idle";
  private mode: Mode = "quick";
  private paused?: Pause;
  private resumeWaiters: (() => void)[] = [];
  private pauseRequested = false;
  private generation = 0;
  private readonly searchLimit: number;
  private readonly today: () => string;

  constructor(
    private readonly shop: Shop,
    private readonly memory: RememberedStore,
    private readonly onChange: (s: RunState) => void = () => undefined,
    opts: RunOptions = {},
  ) {
    this.searchLimit = opts.searchLimit ?? 24;
    this.today = opts.today ?? isoToday;
  }

  state(): RunState {
    return { phase: this.phase, mode: this.mode, rows: this.rows.map((r) => ({ ...r })), paused: this.paused, counts: countsOf(this.rows) };
  }

  private emit(): void {
    this.onChange(this.state());
  }

  private row(line: number): Row {
    const r = this.rows.find((x) => x.line === line);
    if (!r) throw new Error(`No line ${line}`);
    return r;
  }

  /** Waits while paused (by a shop problem or by the user). Returns false if the run was replaced meanwhile. */
  private async gate(gen: number): Promise<boolean> {
    while (this.paused && gen === this.generation) await new Promise<void>((r) => this.resumeWaiters.push(r));
    return gen === this.generation;
  }

  private pauseFor(e: ShopError, during: Pause["during"]): void {
    this.paused = { code: e.code, message: e.message, during };
    this.emit();
  }

  /** User pause (the Pause button while adding): takes effect before the next line. */
  pause(): void {
    if (this.phase === "adding" || this.phase === "finding") this.pauseRequested = true;
  }

  resume(): void {
    this.paused = undefined;
    this.pauseRequested = false;
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const w of waiters) w();
    this.emit();
  }

  private async userPause(gen: number, during: Pause["during"]): Promise<boolean> {
    if (this.pauseRequested) {
      this.pauseRequested = false;
      this.paused = { code: "user", message: "Paused", during };
      this.emit();
    }
    return this.gate(gen);
  }

  // --- finding ---

  /** Starts a new run for `items`, replacing any current one. Resolves when every line has been searched. */
  async find(items: ListItem[], mode: Mode): Promise<void> {
    const gen = ++this.generation;
    this.resume();
    this.mode = mode;
    this.items = new Map(items.map((i) => [i.line, i]));
    this.rows = items.map((i) => ({
      line: i.line,
      raw: i.raw,
      query: i.query,
      searchedFor: i.query,
      qtyText: formatQuantity(i.qty),
      note: i.note,
      mode,
      search: "pending",
      confidence: "none",
      alternatives: [],
      remembered: false,
      changed: false,
      remember: true,
      skipped: false,
      add: "none",
    }));
    this.phase = "finding";
    this.emit();
    for (const r of this.rows) {
      if (!(await this.searchRow(r, gen))) return;
    }
    if (gen === this.generation) {
      this.phase = "review";
      this.emit();
    }
  }

  /** Searches one row, pausing and retrying on shop trouble. False if the run was replaced. */
  private async searchRow(r: Row, gen: number): Promise<boolean> {
    for (;;) {
      if (!(await this.userPause(gen, "finding"))) return false;
      r.search = "searching";
      this.emit();
      try {
        const { products } = await this.shop.search(r.searchedFor, r.mode, this.searchLimit);
        if (gen !== this.generation) return false;
        // Score against the words actually searched, so a hand search ("asafoetida" for "Hing") can match.
        const item = { ...this.items.get(r.line)!, query: r.searchedFor };
        const remembered = r.searchedFor === r.query ? this.memory.get(rememberKey(r.query))?.uid : undefined;
        const m = match(item, products, remembered);
        Object.assign(r, { search: "done", confidence: m.confidence, chosen: m.chosen, alternatives: m.alternatives, remembered: m.remembered, changed: false });
        this.emit();
        return true;
      } catch (e) {
        if (gen !== this.generation) return false;
        if (e instanceof ShopError && e.code === "mode_unknown") {
          Object.assign(r, { search: "done", confidence: "none", chosen: undefined, alternatives: [] });
          this.emit();
          return true;
        }
        r.search = "pending";
        this.pauseFor(e instanceof ShopError ? e : new ShopError("network", (e as Error).message), "finding");
      }
    }
  }

  /** "Search" on a row: new words for that line (or a different mode), re-matched. */
  async searchAgain(line: number, words?: string, mode?: Mode): Promise<void> {
    const r = this.row(line);
    if (words?.trim()) r.searchedFor = words.trim();
    if (mode) r.mode = mode;
    r.skipped = false;
    await this.searchRow(r, this.generation);
  }

  // --- review edits ---

  choose(line: number, uid: number): void {
    const r = this.row(line);
    const all = [r.chosen, ...r.alternatives].filter((c): c is Candidate => !!c);
    const pick = all.find((c) => c.product.uid === uid);
    if (!pick || pick === r.chosen) return;
    const item = this.items.get(line)!;
    r.alternatives = all.filter((c) => c !== pick);
    r.chosen = withPacks(pick, item, pick.packs);
    r.changed = true;
    r.remembered = false;
    r.confidence = "high"; // the user chose it
    this.emit();
  }

  setPacks(line: number, packs: number): void {
    const r = this.row(line);
    if (!r.chosen) return;
    const max = r.chosen.product.maxQty;
    r.chosen = withPacks(r.chosen, this.items.get(line)!, max !== undefined ? Math.min(packs, max) : packs);
    this.emit();
  }

  skip(line: number, skipped: boolean): void {
    this.row(line).skipped = skipped;
    this.emit();
  }

  setRemember(line: number, remember: boolean): void {
    this.row(line).remember = remember;
    this.emit();
  }

  // --- adding ---

  /** Adds every reviewed line that has a product and isn't skipped (or only the failed ones). */
  async addAll(onlyFailed = false): Promise<void> {
    const gen = ++this.generation;
    this.resume();
    const todo = this.rows.filter((r) => r.chosen && !r.skipped && r.search === "done" && (onlyFailed ? r.add === "failed" : r.add !== "added"));
    for (const r of todo) Object.assign(r, { add: "waiting", addError: undefined, addMessage: undefined });
    this.phase = "adding";
    this.emit();

    let cart: Cart | undefined;
    for (const r of todo) {
      for (;;) {
        if (!(await this.userPause(gen, "adding"))) return;
        r.add = "adding";
        this.emit();
        try {
          cart ??= await this.shop.cart();
          const c = r.chosen!;
          const existing = cart.lines.find((l) => l.uid === c.product.uid);
          const before = existing?.quantity ?? 0;
          if (existing) {
            await this.shop.setQuantity(cart.id, existing, existing.quantity + c.packs, r.mode);
            existing.quantity += c.packs;
          } else {
            await this.shop.add(cart.id, { ...c.product, mode: r.mode }, c.packs);
            cart = undefined; // re-read: the new line's identifiers are needed if it comes up again
          }
          Object.assign(r, { add: "added", addedUid: c.product.uid, before });
          if ((r.changed && r.remember) || r.remembered) this.memory.set(rememberedFrom(r.query, { ...c.product, mode: r.mode }, this.today()));
          this.emit();
          break;
        } catch (e) {
          if (gen !== this.generation) return;
          if (e instanceof CartError) {
            // Not enough stock for all the packs (the nearby store often has 1): take what there is.
            const c = r.chosen!;
            if (e.code === "out_of_stock" && c.packs > 1 && !cart?.lines.some((l) => l.uid === c.product.uid)) {
              try {
                await this.shop.add(cart?.id ?? (await this.shop.cart()).id, { ...c.product, mode: r.mode }, 1);
                cart = undefined;
                Object.assign(r, {
                  add: "added",
                  addedUid: c.product.uid,
                  before: 0,
                  addedPacks: 1,
                  addError: "out_of_stock",
                  addMessage: `Only 1 of ${c.packs} added: JioMart has no more in stock`,
                });
                this.emit();
                break;
              } catch {
                /* not even one: fail below */
              }
            }
            Object.assign(r, { add: "failed", addError: e.code, addMessage: e.message });
            this.emit();
            break;
          }
          // The line stays "adding" while paused (the UI shows "Adding… paused") and is retried on resume.
          this.pauseFor(e instanceof ShopError ? e : new ShopError("network", (e as Error).message), "adding");
          if (!(await this.gate(gen))) return;
        }
      }
    }
    if (gen === this.generation) {
      this.phase = "done";
      this.emit();
    }
  }

  /** Drops the run (back to the list). Anything still running stops before its next line. */
  reset(): void {
    this.generation++;
    this.rows = [];
    this.items.clear();
    this.phase = "idle";
    this.resume();
  }

  /**
   * What "Undo this run" should do to the cart: each product this run added goes back to the quantity it had
   * before (0 = remove). If a product was added by two lines, the earliest "before" wins.
   */
  undoTargets(): TidyTarget[] {
    const byUid = new Map<number, TidyTarget>();
    for (const r of this.rows) {
      if (r.add !== "added" || r.addedUid === undefined || r.undone) continue;
      const prev = byUid.get(r.addedUid);
      const before = r.before ?? 0;
      byUid.set(r.addedUid, { uid: r.addedUid, name: r.chosen?.product.name, toQuantity: prev ? Math.min(prev.toQuantity, before) : before });
    }
    return [...byUid.values()];
  }

  /** Marks what this run added as taken back, for products whose cart line was undone or removed. */
  markUndone(uids: number[]): void {
    const set = new Set(uids);
    for (const r of this.rows) if (r.addedUid !== undefined && set.has(r.addedUid)) r.undone = true;
    this.emit();
  }

  /** Back to review from done (e.g. to change something and add again). */
  backToReview(): void {
    if (this.phase === "done") {
      this.phase = "review";
      this.emit();
    }
  }
}

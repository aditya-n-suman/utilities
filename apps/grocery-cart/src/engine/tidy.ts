// Tidying the JioMart cart: remove many lines (or bring them back to an earlier quantity) without clicking each one
// on JioMart, whose cart page reloads after every change. One line at a time at the client's write pace.
// The cart is re-read before each change: JioMart renumbers lines (item_index) as they go.
// Shop trouble pauses on the current line and resume() retries it; a refused change fails that line only.

import type { Cart, CartLine } from "./jiomart/api.ts";
import { CartError, ShopError } from "./jiomart/client.ts";
import type { Pause } from "./run.ts";

export interface CartShop {
  cart(): Promise<Cart>;
  setQuantity(cartId: string, line: CartLine, quantity: number): Promise<void>;
  remove(cartId: string, line: CartLine): Promise<void>;
}

/** Bring product `uid` down to `toQuantity` (0 removes the line). */
export interface TidyTarget {
  uid: number;
  name?: string;
  toQuantity: number;
}

export interface TidyState {
  phase: "idle" | "removing" | "done";
  total: number;
  done: number;
  current?: number;
  failed: { uid: number; name?: string; message: string }[];
  paused?: Pause;
}

export class CartTidy {
  private s: TidyState = { phase: "idle", total: 0, done: 0, failed: [] };
  private waiters: (() => void)[] = [];
  private pauseRequested = false;
  private generation = 0;

  constructor(
    private readonly shop: CartShop,
    private readonly onChange: () => void = () => undefined,
  ) {}

  state(): TidyState {
    return { ...this.s, failed: [...this.s.failed] };
  }

  private emit(): void {
    this.onChange();
  }

  pause(): void {
    if (this.s.phase === "removing") this.pauseRequested = true;
  }

  resume(): void {
    this.s.paused = undefined;
    this.pauseRequested = false;
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
    this.emit();
  }

  private async gate(gen: number): Promise<boolean> {
    if (this.pauseRequested) {
      this.pauseRequested = false;
      this.s.paused = { code: "user", message: "Paused", during: "adding" };
      this.emit();
    }
    while (this.s.paused && gen === this.generation) await new Promise<void>((r) => this.waiters.push(r));
    return gen === this.generation;
  }

  /** Back to idle (after the user has seen the result). */
  reset(): void {
    this.generation++;
    this.s = { phase: "idle", total: 0, done: 0, failed: [] };
    this.resume();
  }

  async run(targets: TidyTarget[]): Promise<void> {
    const gen = ++this.generation;
    this.s = { phase: "removing", total: targets.length, done: 0, failed: [] };
    this.pauseRequested = false;
    this.emit();
    for (const t of targets) {
      this.s.current = t.uid;
      this.emit();
      for (;;) {
        if (!(await this.gate(gen))) return;
        try {
          const cart = await this.shop.cart();
          const line = cart.lines.find((l) => l.uid === t.uid);
          if (line && line.quantity > t.toQuantity) {
            if (t.toQuantity <= 0) await this.shop.remove(cart.id, line);
            else await this.shop.setQuantity(cart.id, line, t.toQuantity);
          }
          this.s.done++;
          break;
        } catch (e) {
          if (gen !== this.generation) return;
          if (e instanceof CartError) {
            this.s.failed.push({ uid: t.uid, name: t.name, message: e.message });
            this.s.done++;
            break;
          }
          const err = e instanceof ShopError ? e : new ShopError("network", (e as Error).message);
          this.s.paused = { code: err.code, message: err.message, during: "adding" };
          this.emit();
        }
      }
      this.emit();
    }
    if (gen === this.generation) {
      this.s.current = undefined;
      this.s.phase = "done";
      this.emit();
    }
  }
}

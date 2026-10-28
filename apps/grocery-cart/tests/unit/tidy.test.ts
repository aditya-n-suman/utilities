import { describe, expect, it } from "vitest";
import type { Cart, CartLine, Mode, Product } from "../../src/engine/jiomart/api.ts";
import { CartError, ShopError } from "../../src/engine/jiomart/client.ts";
import { parseList } from "../../src/engine/list.ts";
import { MemoryStore } from "../../src/engine/remembered.ts";
import { Run, type Shop } from "../../src/engine/run.ts";
import { type CartShop, CartTidy } from "../../src/engine/tidy.ts";

/** A cart that renumbers lines after each removal, like JioMart, and checks the index it's given. */
class FakeCart implements CartShop, Shop {
  lines: { uid: number; quantity: number }[] = [];
  reads = 0;
  failNext?: Error;
  refuse = new Set<number>();
  constructor(lines: [number, number][]) {
    this.lines = lines.map(([uid, quantity]) => ({ uid, quantity }));
  }
  private toLine(l: { uid: number; quantity: number }, i: number): CartLine {
    return { uid: l.uid, name: `P${l.uid}`, size: "OS", quantity: l.quantity, identifier: `id${l.uid}`, articleId: `a${l.uid}`, itemIndex: i, verticalCode: "GROCERIES" };
  }
  async cart(): Promise<Cart> {
    this.reads++;
    return { id: "c1", lines: this.lines.map((l, i) => this.toLine(l, i)) };
  }
  private check(line: CartLine) {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = undefined;
      throw e;
    }
    if (this.refuse.has(line.uid)) throw new CartError("not_in_cart", "Failed to remove item from cart");
    const i = this.lines.findIndex((l) => l.uid === line.uid);
    if (i !== line.itemIndex) throw new CartError("not_in_cart", "stale index");
    return i;
  }
  async remove(_id: string, line: CartLine) {
    this.lines.splice(this.check(line), 1);
  }
  async setQuantity(_id: string, line: CartLine, quantity: number) {
    const i = this.check(line);
    if (quantity <= 0) this.lines.splice(i, 1);
    else this.lines[i].quantity = quantity;
  }
  async search(query: string, mode: Mode) {
    const p: Product = { uid: query === "Atta" ? 1 : 2, name: `${query} 1 kg`, size: "OS", pack: { value: 1, unit: "kg" }, price: 100, sellable: true, minQty: 1, categories: [], verticalCode: "GROCERIES", sellerId: 1, variants: [], mode };
    return { products: [p] };
  }
  async add(_id: string, p: Product, quantity: number) {
    this.lines.push({ uid: p.uid, quantity });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("cart tidy", () => {
  it("removes many lines, re-reading the cart so line numbers stay right", async () => {
    const shop = new FakeCart([[1, 1], [2, 3], [3, 1], [4, 2]]);
    const tidy = new CartTidy(shop);
    await tidy.run([{ uid: 1, toQuantity: 0 }, { uid: 3, toQuantity: 0 }, { uid: 4, toQuantity: 1 }, { uid: 99, toQuantity: 0 }]);
    expect(shop.lines).toEqual([{ uid: 2, quantity: 3 }, { uid: 4, quantity: 1 }]);
    expect(tidy.state()).toMatchObject({ phase: "done", total: 4, done: 4, failed: [] });
    expect(shop.reads).toBe(4);
  });

  it("fails a refused line and carries on", async () => {
    const shop = new FakeCart([[1, 1], [2, 1]]);
    shop.refuse.add(1);
    const tidy = new CartTidy(shop);
    await tidy.run([{ uid: 1, name: "Atta", toQuantity: 0 }, { uid: 2, toQuantity: 0 }]);
    expect(tidy.state().failed).toEqual([{ uid: 1, name: "Atta", message: "Failed to remove item from cart" }]);
    expect(shop.lines).toEqual([{ uid: 1, quantity: 1 }]);
  });

  it("pauses on shop trouble and retries the same line", async () => {
    const shop = new FakeCart([[1, 1], [2, 1]]);
    shop.failNext = new ShopError("human_check", "check");
    const tidy = new CartTidy(shop);
    const done = tidy.run([{ uid: 1, toQuantity: 0 }, { uid: 2, toQuantity: 0 }]);
    await tick();
    expect(tidy.state().paused?.code).toBe("human_check");
    expect(tidy.state().current).toBe(1);
    tidy.resume();
    await done;
    expect(shop.lines).toEqual([]);
  });

  it("lets the user pause between lines", async () => {
    const shop = new FakeCart([[1, 1], [2, 1], [3, 1]]);
    const tidy = new CartTidy(shop);
    const done = tidy.run([1, 2, 3].map((uid) => ({ uid, toQuantity: 0 })));
    tidy.pause();
    for (let i = 0; i < 5; i++) await tick();
    expect(tidy.state().paused?.code).toBe("user");
    expect(shop.lines).toHaveLength(2);
    tidy.resume();
    await done;
    expect(shop.lines).toHaveLength(0);
  });
});

describe("undo this run", () => {
  it("puts each product back to what the cart had before", async () => {
    const shop = new FakeCart([[2, 1], [7, 4]]); // toor dal (uid 2) was already in the cart once
    const run = new Run(shop, new MemoryStore());
    await run.find(parseList("Atta ; 2 kg\nToor dal ; 3 kg").items, "quick");
    await run.addAll();
    expect(shop.lines).toEqual([{ uid: 2, quantity: 4 }, { uid: 7, quantity: 4 }, { uid: 1, quantity: 2 }]);
    const targets = run.undoTargets();
    expect(targets).toEqual([
      { uid: 1, name: "Atta 1 kg", toQuantity: 0 },
      { uid: 2, name: "Toor dal 1 kg", toQuantity: 1 },
    ]);
    await new CartTidy(shop).run(targets);
    expect(shop.lines).toEqual([{ uid: 2, quantity: 1 }, { uid: 7, quantity: 4 }]);
    run.markUndone(targets.map((t) => t.uid));
    expect(run.undoTargets()).toEqual([]);
  });
});

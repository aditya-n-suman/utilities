import { describe, expect, it } from "vitest";
import type { Cart, CartLine, Mode, Product } from "../../src/engine/jiomart/api.ts";
import { CartError, ShopError } from "../../src/engine/jiomart/client.ts";
import { parseList } from "../../src/engine/list.ts";
import { coversText, match, packPlan, sizeInQuery, tokens, withPacks } from "../../src/engine/match.ts";
import { MemoryStore, rememberKey } from "../../src/engine/remembered.ts";
import { Run, type RunState, type Shop } from "../../src/engine/run.ts";
import { parseAmount } from "../../src/engine/units.ts";

let uid = 1000;
function P(name: string, price: number, extra: Partial<Product> = {}): Product {
  const size = /(\d+(?:\.\d+)?\s*(?:kg|g|ml|L))\b[^\d]*$/i.exec(name)?.[1];
  return {
    uid: ++uid,
    name,
    size: "OS",
    pack: size ? parseAmount(size) : undefined,
    price,
    mrp: price + 20,
    sellable: true,
    minQty: 1,
    categories: [],
    verticalCode: "GROCERIES",
    sellerId: 1,
    variants: [],
    ...extra,
  };
}
const item = (line: string) => parseList(line).items[0];

describe("words", () => {
  it("normalises shop words and drops sizes", () => {
    expect(tokens("Tata Sampann Unpolished Tur / Arhar Dal 1 kg")).toEqual(["tata", "sampann", "unpolished", "toor", "toor", "dal"]);
    expect(tokens("Jeera 100g")).toEqual(["jeera"]);
    expect(tokens("Cumin Seeds")).toEqual(["jeera", "seed"]);
    expect(sizeInQuery("Pressure cooker 5 L")).toEqual({ value: 5, unit: "L" });
    expect(sizeInQuery("Container 500 g")).toEqual({ value: 500, unit: "g" });
    expect(sizeInQuery("Tea strainer")).toBeUndefined();
  });

  it("plans packs for an amount", () => {
    expect(packPlan({ kind: "amount", value: 5, unit: "kg" }, { value: 5, unit: "kg" })).toEqual({ packs: 1, overBuy: 1 });
    expect(packPlan({ kind: "amount", value: 5, unit: "kg" }, { value: 2, unit: "kg" })).toEqual({ packs: 3, overBuy: 1.2 });
    expect(packPlan({ kind: "amount", value: 5, unit: "L" }, { value: 1, unit: "L" }).packs).toBe(5);
    expect(packPlan({ kind: "count", value: 6 }, undefined)).toEqual({ packs: 6, overBuy: 1 });
    expect(coversText({ kind: "amount", value: 200, unit: "g" }, { value: 100, unit: "g" }, 2)).toBe("2 × 100 g = 200 g");
    expect(coversText({ kind: "amount", value: 5, unit: "kg" }, { value: 2.5, unit: "kg" }, 2)).toBe("2 × 2.5 kg = 5 kg");
    expect(coversText({ kind: "amount", value: 1, unit: "kg" }, { value: 500, unit: "g" }, 2)).toBe("2 × 500 g = 1 kg");
    expect(coversText({ kind: "count", value: 6 }, undefined, 6)).toBe("x6");
  });
});

describe("match", () => {
  it("prefers packed over loose, and sellable over not", () => {
    const m = match(item("Toor dal ; 2 kg"), [
      P("Loose Toor Dal Value 1 kg", 156),
      P("Tata Sampann Unpolished Tur / Arhar Dal 1 kg", 189, { sellable: false }),
      P("Good Life Tur Dal 1 kg", 172),
      P("Tata Sampann Unpolished Toor Dal 2 kg", 369),
    ]);
    expect(m.chosen?.product.name).toBe("Tata Sampann Unpolished Toor Dal 2 kg");
    expect(m.chosen?.covers).toBe("1 × 2 kg = 2 kg");
    expect(m.confidence).toBe("high");
    expect(m.alternatives[0].product.name).toBe("Good Life Tur Dal 1 kg");
    expect(m.alternatives[0].packs).toBe(2);
    expect(m.alternatives.at(-1)?.issues).toContain("not available now");
  });

  it("buys several small packs when there's no big one, and says so", () => {
    const m = match(item("Mustard oil ; 5 L"), [P("Fortune Kachi Ghani Pure Mustard Oil 1 L Pouch", 178)]);
    expect(m.chosen?.packs).toBe(5);
    expect(m.chosen?.covers).toBe("5 × 1 L = 5 L");
    expect(m.chosen?.lineTotal).toBe(890);
    expect(m.chosen?.pricePerUnit).toEqual({ value: 178, per: "L" });
    expect(m.confidence).toBe("high");
  });

  it("flags over-buying and a missing pack size", () => {
    const big = match(item("Jeera ; 100 g"), [P("Catch Jeera Whole 1 kg", 600)]);
    expect(big.confidence).toBe("medium");
    expect(big.chosen?.issues[0]).toMatch(/buys 1 kg for 100 g/);
    const noPack = match(item("Atta ; 5 kg"), [P("Chakki atta (pack)", 250)]);
    expect(noPack.chosen?.issues).toContain("pack size not stated");
  });

  it("matches a size in the name against each piece", () => {
    const m = match(item("Pressure cooker 5 L ; x1"), [
      P("Hawkins Classic Pressure Cooker 3 L", 1500),
      P("Prestige Popular Aluminium Pressure Cooker 5 L, Inner Lid", 1849),
    ]);
    expect(m.chosen?.product.name).toMatch(/Prestige/);
    expect(m.chosen?.covers).toBe("x1");
    expect(m.alternatives[0].issues).toContain("3 L, not 5 L");
  });

  it("uses synonyms and reports missing words", () => {
    expect(match(item("Jeera ; 100 g"), [P("Everest Cumin Seeds 100 g", 58)]).confidence).toBe("high");
    const m = match(item("Steel container 5 kg ; x3"), [P("Plastic Storage Container 5 kg", 300)]);
    expect(m.confidence).not.toBe("high");
    expect(m.chosen?.issues[0]).toBe("doesn't mention steel");
  });

  it("caps packs at the order limit", () => {
    const m = match(item("Sugar ; 10 kg"), [P("Madhur Sugar 1 kg", 52, { maxQty: 4 })]);
    expect(m.chosen?.packs).toBe(4);
    expect(m.chosen?.issues).toContain("JioMart sells at most 4 per order");
    expect(m.confidence).toBe("medium");
  });

  it("finds nothing when nothing fits, and prefers a remembered product", () => {
    expect(match(item("Hing ; 50 g"), [P("Garbage bags", 99)]).status).toBe("not_found");
    expect(match(item("Hing ; 50 g"), []).status).toBe("not_found");
    const a = P("Aashirvaad Atta 5 kg", 289);
    const b = P("Pillsbury Atta 5 kg", 275);
    const m = match(item("Atta ; 5 kg"), [b, a], a.uid);
    expect(m.chosen?.product).toBe(a);
    expect(m.remembered).toBe(true);
  });

  it("counts sets as several pieces", () => {
    const m = match(item("Container 1 kg ; x6"), [P("Joyo Storewell Containers 1 kg (Set of 3)", 118, { pieces: 3 })]);
    expect(m.chosen?.packs).toBe(2);
    expect(m.chosen?.covers).toBe("2 × set of 3 = 6 pcs");
    expect(m.chosen?.lineTotal).toBe(236);
    const big = match(item("Steel glass ; x2"), [P("Steel Glass (Set of 10)", 499, { pieces: 10 })]);
    expect(big.chosen?.issues).toContain("a set of 10 for 2");
  });

  it("re-plans packs from the stepper", () => {
    const m = match(item("Atta ; 5 kg"), [P("Aashirvaad Atta 5 kg", 289)]);
    const c = withPacks(m.chosen!, item("Atta ; 5 kg"), 2);
    expect([c.packs, c.covers, c.lineTotal]).toEqual([2, "2 × 5 kg = 10 kg", 578]);
  });
});

// --- run ---

class FakeShop implements Shop {
  cartLines: CartLine[] = [];
  searches: { query: string; mode: Mode }[] = [];
  failNextSearch?: ShopError;
  refuse = new Map<string, CartError>();
  constructor(private catalog: Record<string, Product[]>) {}
  async search(query: string, mode: Mode) {
    this.searches.push({ query, mode });
    if (this.failNextSearch) {
      const e = this.failNextSearch;
      this.failNextSearch = undefined;
      throw e;
    }
    return { products: this.catalog[query.toLowerCase()] ?? [] };
  }
  async cart(): Promise<Cart> {
    return { id: "c1", lines: this.cartLines.map((l) => ({ ...l })) };
  }
  async add(_id: string, p: Product, quantity: number) {
    const refusal = this.refuse.get(p.name);
    if (refusal) throw refusal;
    this.cartLines.push({ uid: p.uid, name: p.name, size: p.size, quantity, identifier: `L${p.uid}`, articleId: "a", itemIndex: 0, verticalCode: "GROCERIES" });
  }
  async setQuantity(_id: string, line: CartLine, quantity: number) {
    this.cartLines.find((l) => l.uid === line.uid)!.quantity = quantity;
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("run", () => {
  const atta = P("Aashirvaad Atta 5 kg", 289);
  const fortune = P("Fortune Chakki Fresh Atta 5 kg", 262);
  const dal = P("Good Life Tur Dal 1 kg", 172);
  const oil = P("Fortune Mustard Oil 1 L", 178);
  const catalog = () => ({ atta: [atta, fortune], "toor dal": [dal], "mustard oil": [oil] });
  const list = parseList("Atta ; 5 kg ; आटा\nToor dal ; 2 kg\nHing ; 50 g\nMustard oil ; 5 L").items;

  it("finds, lets you edit, adds, and remembers your picks", async () => {
    const shop = new FakeShop(catalog());
    const memory = new MemoryStore();
    const states: RunState[] = [];
    const run = new Run(shop, memory, (s) => states.push(s), { today: () => "2026-10-28" });
    await run.find(list, "quick");
    let s = run.state();
    expect(s.phase).toBe("review");
    expect(s.counts).toMatchObject({ total: 4, searched: 4, notFound: 1, toAdd: 3 });
    expect(states.some((x) => x.rows[0]?.search === "searching")).toBe(true);
    expect(s.rows[0]).toMatchObject({ query: "Atta", qtyText: "5 kg", note: "आटा", search: "done" });
    expect(s.counts.estimatedTotal).toBe(Math.round(s.rows[0].chosen!.lineTotal! + 344 + 890));

    run.choose(1, fortune.uid);
    run.setPacks(2, 3);
    run.skip(4, true);
    s = run.state();
    expect(s.rows[0]).toMatchObject({ changed: true, confidence: "high" });
    expect(s.rows[0].chosen?.product.uid).toBe(fortune.uid);
    expect(s.rows[0].alternatives.map((a) => a.product.uid)).toContain(atta.uid);
    expect(s.rows[1].chosen?.covers).toBe("3 × 1 kg = 3 kg");
    expect(s.counts.skipped).toBe(1);

    shop.cartLines.push({ uid: dal.uid, size: "OS", quantity: 1, identifier: "Ld", articleId: "a", itemIndex: 0, verticalCode: "GROCERIES" });
    await run.addAll();
    s = run.state();
    expect(s.phase).toBe("done");
    expect(s.counts).toMatchObject({ added: 2, failed: 0 });
    expect(shop.cartLines.find((l) => l.uid === fortune.uid)?.quantity).toBe(1);
    expect(shop.cartLines.find((l) => l.uid === dal.uid)?.quantity).toBe(4); // already had 1, added 3
    expect(shop.cartLines.some((l) => l.uid === oil.uid)).toBe(false); // skipped
    expect(memory.get(rememberKey("Atta"))).toMatchObject({ uid: fortune.uid, lastUsed: "2026-10-28", mode: "quick" });
    expect(memory.get(rememberKey("Toor dal"))).toBeUndefined(); // not changed by you

    // Next time, the remembered product is picked.
    const again = new Run(new FakeShop(catalog()), memory);
    await again.find(list.slice(0, 1), "quick");
    expect(again.state().rows[0]).toMatchObject({ remembered: true, confidence: "high" });
    expect(again.state().rows[0].chosen?.product.uid).toBe(fortune.uid);
  });

  it("pauses on shop trouble and retries the same line on resume", async () => {
    const shop = new FakeShop(catalog());
    shop.failNextSearch = new ShopError("human_check", "JioMart wants to check you're human");
    const run = new Run(shop, new MemoryStore());
    const done = run.find(list.slice(0, 2), "all");
    await tick();
    expect(run.state().paused).toMatchObject({ code: "human_check", during: "finding" });
    expect(run.state().rows[0].search).toBe("pending");
    run.resume();
    await done;
    expect(run.state().phase).toBe("review");
    expect(shop.searches.map((x) => x.query)).toEqual(["Atta", "Atta", "Toor dal"]);
    expect(shop.searches.every((x) => x.mode === "all")).toBe(true);
  });

  it("fails a refused line and carries on; retry adds only the failed ones", async () => {
    const shop = new FakeShop(catalog());
    shop.refuse.set(dal.name, new CartError("out_of_stock", "Product is out of stock"));
    const run = new Run(shop, new MemoryStore());
    await run.find(list, "quick");
    await run.addAll();
    let s = run.state();
    expect(s.rows[1]).toMatchObject({ add: "failed", addError: "out_of_stock" });
    expect(s.counts).toMatchObject({ added: 2, failed: 1 });
    shop.refuse.clear();
    await run.addAll(true);
    s = run.state();
    expect(s.counts).toMatchObject({ added: 3, failed: 0 });
    expect(shop.cartLines).toHaveLength(3);
  });

  it("searches a row again with other words or in the other mode", async () => {
    const shop = new FakeShop({ ...catalog(), asafoetida: [P("LG Asafoetida 50 g", 99)] });
    const run = new Run(shop, new MemoryStore());
    await run.find(list, "quick");
    expect(run.state().rows[2].chosen).toBeUndefined();
    await run.searchAgain(3, "asafoetida", "all");
    const r = run.state().rows[2];
    expect(r).toMatchObject({ searchedFor: "asafoetida", mode: "all", search: "done" });
    expect(r.chosen?.product.name).toBe("LG Asafoetida 50 g");
  });

  it("lets the user pause between lines", async () => {
    const shop = new FakeShop(catalog());
    const run = new Run(shop, new MemoryStore());
    await run.find(list, "quick");
    const adding = run.addAll();
    run.pause(); // takes effect after the line in progress
    for (let i = 0; i < 5; i++) await tick();
    expect(run.state().paused?.code).toBe("user");
    expect(shop.cartLines).toHaveLength(1);
    run.resume();
    await adding;
    expect(shop.cartLines).toHaveLength(3);
  });
});

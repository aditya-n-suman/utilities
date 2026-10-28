import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addBody, addTemplateFrom, describeTemplate, parseCart, parseSearch, pathOfValue, piecesFromName, valueAt, quickFilter, searchUrl, sizeFromName, storeFromFilter, updateBody } from "../../src/engine/jiomart/api.ts";
import { CartError, cartErrorCode, type FetchRequest, type FetchResponse, JioMartClient, type Session, ShopError } from "../../src/engine/jiomart/client.ts";
import { areaCode, modeOfFilter, type Observed, observe, observeSearchAnswer, pageHeaders } from "../../src/local/jiomart-tab.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/jiomart/${name}`, import.meta.url), "utf8")) as unknown;
const SEARCH = fixture("search-atta.json");
const CART = fixture("cart.json");

const json = (body: unknown, status = 200): FetchResponse => ({ status, contentType: "application/json", body: JSON.stringify(body) });

function fakeShop(handler: (req: FetchRequest) => FetchResponse) {
  const calls: FetchRequest[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const session: Session = {
    headers: { authorization: "Bearer app", "x-location-detail": "loc" },
    cartQuery: "area_code=000000&b=true&i=true",
    filters: { quick: quickFilter("13895"), all: "" },
    modeHeaders: { all: { authorization: "Bearer app", "x-location-detail": "loc-all" } },
  };
  const client = new JioMartClient(
    async (req) => {
      calls.push(req);
      return handler(req);
    },
    session,
    { sleep: async (ms) => void (sleeps.push(ms), (clock += ms)), now: () => clock },
  );
  return { client, calls, sleeps, session };
}

describe("parsing", () => {
  it("reads products, pack sizes and variants", () => {
    const page = parseSearch(SEARCH)!;
    expect(page.total).toBe(278);
    expect(page.next).toBe("tok-page-2");
    expect(page.products.map((p) => p.uid)).toEqual([132487249, 7507147, 7528100]);
    const [aashirvaad, fortune, loose] = page.products;
    expect(aashirvaad).toMatchObject({
      pack: { value: 5, unit: "kg" },
      perUnitText: "49.00/kg",
      categories: ["Cooking Essentials", "Atta, Flours & Sooji", "Atta"],
      image: "https://cdn.example/atta.jpg",
      journey: "quickcommerce",
      variants: [
        { uid: 132487249, label: "5 kg", available: true },
        { uid: 132487250, label: "10 kg", available: false },
      ],
    });
    expect(fortune.pack).toEqual({ value: 5, unit: "kg" }); // from attributes.product-size
    expect(fortune.size).toBe("5 KG");
    expect(loose.pack).toEqual({ value: 1, unit: "kg" }); // from the name
    expect(loose.sellable).toBe(false);
  });

  it("reads sizes and sets from real product names", () => {
    expect(sizeFromName("Prestlee Aluminium Non Induction Base Pressure Cooker 5 Ltr / ISI Certified / 5 Year Warranty")).toEqual({ value: 5, unit: "L" });
    expect(sizeFromName("Fortune Premium Kachi Ghani Pure Mustard Oil 910 g")).toEqual({ value: 910, unit: "g" });
    expect(sizeFromName("Joyo Storewell Containers 2 L (Set of 3) - Design/colour may vary")).toEqual({ value: 2, unit: "L" });
    expect(sizeFromName("Univision Commando Stainless Steel Strainer (No.2)")).toBeUndefined();
    expect(piecesFromName("Mastercook Assorted Colour Plastic Container 1.5 L (Set of 10)")).toBe(10);
    expect(piecesFromName("MUKE stainless steel dabba set 5 kg Size Steel Container 2 pcs.")).toBe(2);
    expect(piecesFromName("Aashirvaad Atta 5 kg")).toBeUndefined();
  });

  it("reads the cart", () => {
    const cart = parseCart(CART)!;
    expect(cart).toMatchObject({ id: "cart-1", total: 242, mrpTotal: 749 });
    expect(cart.lines).toEqual([
      expect.objectContaining({ uid: 82239826, quantity: 1, identifier: "FO9ms15gRLq26X0KjbyZ2Q", size: "OS", journey: "standard", itemIndex: 0 }),
      expect.objectContaining({ uid: 7507147, quantity: 2, articleId: "692794663dcd7ab2ae455d36", size: "5 KG", journey: "quickcommerce", itemIndex: 1 }),
    ]);
  });

  it("builds the page's update body", () => {
    const line = parseCart(CART)!.lines[1];
    expect(updateBody(line, 3)).toMatchObject({
      operation: "update_item",
      item: { article_id: "692794663dcd7ab2ae455d36", item_id: 7507147, identifiers: { identifier: "sHqFskWmSHmFnbSndB8NNA" }, item_size: "5 KG", quantity: 3, item_index: 1 },
    });
  });

  it("builds search URLs and reads the store", () => {
    expect(searchUrl(quickFilter("13895"), "toor dal")).toBe(
      "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?f=journey%3Aquickcommerce%3A%3A%3Astore_ids%3A13895%7C%7C13895&q=toor+dal",
    );
    expect(searchUrl(undefined, "atta", "tok", 50)).toBe("https://www.jiomart.com/ext/vertex/application/api/v1.0/products?page_id=tok&page_size=50&q=atta");
    expect(storeFromFilter("journey:quickcommerce:::store_ids:13895||13895")).toBe("13895");
  });
});

describe("client", () => {
  it("searches with the mode's filter and headers, and pages until the limit", async () => {
    const second = JSON.parse(JSON.stringify(SEARCH)) as { items: { uid: number }[] };
    for (const it of second.items) it.uid += 1;
    const pages = [SEARCH, { ...second, page: { has_next: false }, meta: {} }];
    const { client, calls } = fakeShop(() => json(pages.shift()));
    const { products, total } = await client.search("atta", "all", 5);
    expect(total).toBe(278);
    expect(products).toHaveLength(5);
    expect(products.every((p) => p.mode === "all")).toBe(true);
    expect(calls.map((c) => new URL(c.url).search)).toEqual(["?q=atta", "?page_id=tok-page-2&page_size=50&q=atta"]);
    expect(calls[0].headers["x-location-detail"]).toBe("loc-all");
  });

  it("stops paging when JioMart repeats a page", async () => {
    const { client, calls } = fakeShop(() => json(SEARCH));
    const { products } = await client.search("atta", "quick", 40);
    expect(products).toHaveLength(3);
    expect(calls).toHaveLength(2);
  });

  it("adds with the learnt template for the product's mode", async () => {
    const { client, calls, session } = fakeShop(() =>
      json({ success: true, identifiers: { L: { item_id: 7507147, article_id: "a", item_index: 0, quantity: 1 } } }),
    );
    session.addTemplates = { all: { query: { journey: "standard" }, item: { meta: { journey: "standard" } }, top: {} } };
    await client.add("c1", { ...parseSearch(SEARCH)!.products[1], mode: "all" }, 1);
    await client.add("c1", { ...parseSearch(SEARCH)!.products[1], mode: "quick" }, 1);
    expect(new URL(calls[0].url).search).toBe("?id=c1&journey=standard");
    expect(JSON.parse(calls[0].body!).items[0].meta).toEqual({ vertical_code: "GROCERIES", compute_delivery_fee: true, journey: "standard" });
    expect(new URL(calls[1].url).search).toBe("?id=c1");
  });

  it("pages the way the page was seen to", async () => {
    const second = JSON.parse(JSON.stringify(SEARCH)) as { items: { uid: number }[] };
    for (const it of second.items) it.uid += 1;
    const pages = [{ ...(SEARCH as object), page: { has_next: true, next_id: "2" } }, { ...second, page: { has_next: false } }];
    const { client, calls, session } = fakeShop(() => json(pages.shift()));
    session.paging = { idFrom: "page.next_id", params: { page_size: "50", page_type: "cursor" } };
    const { products } = await client.search("atta", "quick", 40);
    expect(products).toHaveLength(6);
    expect(new URL(calls[1].url).search).toBe(
      `?f=${encodeURIComponent(quickFilter("13895"))}&page_id=2&page_size=50&page_type=cursor&q=atta`.replace(/%20/g, "+"),
    );
  });

  it("stops at the first page when it has enough", async () => {
    const { client, calls } = fakeShop(() => json(SEARCH));
    const { products } = await client.search("atta", "quick", 3);
    expect(products).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).searchParams.get("f")).toBe(quickFilter("13895"));
    expect(calls[0].headers["x-location-detail"]).toBe("loc");
  });

  it("refuses a mode it hasn't learnt", async () => {
    const { client, session } = fakeShop(() => json(SEARCH));
    delete session.filters.all;
    await expect(client.search("atta", "all")).rejects.toMatchObject({ code: "mode_unknown" });
  });

  it("turns JioMart's answers into error codes", async () => {
    const cases: [FetchResponse, string][] = [
      [json({ message: "unauthorised" }, 401), "signed_out"],
      [{ status: 403, contentType: "text/html", body: "<html>Access Denied</html>" }, "human_check"],
      [{ status: 200, contentType: "text/html; charset=utf-8", body: "<html>captcha</html>" }, "human_check"],
      [json({}, 429), "rate_limited"],
      [{ status: 200, contentType: "application/json", body: "not json" }, "shop_changed"],
      [json({ error: "boom" }, 502), "shop_changed"],
      [json({ unexpected: true }), "shop_changed"],
      [{ status: 0, contentType: "", body: "", error: "TypeError: Failed to fetch" }, "network"],
    ];
    for (const [res, code] of cases) {
      const { client } = fakeShop(() => res);
      const err = await client.search("atta", "quick").catch((e: unknown) => e);
      expect(err, code).toBeInstanceOf(ShopError);
      expect((err as ShopError).code).toBe(code);
    }
  });

  it("adds, changes and removes, pacing writes", async () => {
    const { client, calls, sleeps } = fakeShop((req) => {
      if (req.method === "POST") {
        return json({ success: true, message: "Product has been added to cart", identifiers: { L1: { item_id: 7507147, article_id: "art", item_index: 4, quantity: 2 } } });
      }
      return json({ success: true, message: "ok" });
    });
    const product = { ...parseSearch(SEARCH)!.products[1], mode: "quick" as const };
    const line = await client.add("cart-1", product, 2);
    expect(line).toEqual({ identifier: "L1", articleId: "art", itemIndex: 4, quantity: 2 });
    const cartLine = parseCart(CART)!.lines[1];
    await client.setQuantity("cart-1", cartLine, 3);
    await client.setQuantity("cart-1", cartLine, 0);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}${new URL(c.url).search}`)).toEqual([
      "POST /api/service/application/cart/v2.0/bulk-detail?id=cart-1",
      "PUT /api/service/application/cart/v2.0/detail?id=cart-1",
      "PUT /api/service/application/cart/v2.0/detail?id=cart-1",
    ]);
    expect(JSON.parse(calls[0].body!).items[0]).toMatchObject({ item_id: 7507147, item_size: "5 KG", quantity: 2 });
    expect(JSON.parse(calls[1].body!)).toMatchObject({ operation: "update_item", item: { quantity: 3 } });
    expect(JSON.parse(calls[2].body!)).toMatchObject({ operation: "remove_item", item: { quantity: 0 } });
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(sleeps).toEqual([1500, 1500]); // the 2nd and 3rd writes wait for the gap
  });

  it("reports a refused write with a reason", async () => {
    const { client } = fakeShop(() => json({ success: false, message: "Product is out of stock" }));
    const err = await client.add("cart-1", parseSearch(SEARCH)!.products[0], 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CartError);
    expect((err as CartError).code).toBe("out_of_stock");
    expect(cartErrorCode("You can add maximum 2 quantity")).toBe("qty_limit");
    expect(cartErrorCode("Failed to remove item from cart")).toBe("not_in_cart");
    expect(cartErrorCode("Something odd")).toBe("shop_error");
  });

  it("reads the cart with the page's query", async () => {
    const { client, calls } = fakeShop(() => json(CART));
    expect((await client.cart()).lines).toHaveLength(2);
    expect(calls[0].url).toBe("https://www.jiomart.com/api/service/application/cart/v1.0/detail?area_code=000000&b=true&i=true");
  });
});

describe("learning from the page", () => {
  it("collects headers, cart query and per-mode filters", () => {
    const o: Observed = { filters: {}, modeHeaders: {}, addTemplates: {} };
    const h = { authorization: "Bearer app", cookie: "c", "x-fp-signature": "sig", "x-fp-date": "d", "x-location-detail": "loc", "user-agent": "ua" };
    observe(o, "https://www.jiomart.com/api/service/application/cart/v1.0/detail?area_code=110001&b=true&i=true", h);
    observe(o, "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?f=journey%3Aquickcommerce%3A%3A%3Astore_ids%3A1%7C%7C1&q=rice", h);
    observe(o, "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?q=rice", { ...h, "x-location-detail": "loc-all" });
    observe(o, "https://ads.jiomartjcp.com/ads/x", h);
    expect(o.headers).toEqual({ authorization: "Bearer app", "x-location-detail": "loc-all" });
    expect(o.cartQuery).toBe("area_code=110001&b=true&i=true");
    expect(o.filters).toEqual({ quick: "journey:quickcommerce:::store_ids:1||1", all: "" });
    expect(o.modeHeaders.quick?.["x-location-detail"]).toBe("loc");
    expect(o.modeHeaders.all?.["x-location-detail"]).toBe("loc-all");
    expect(areaCode(o.cartQuery)).toBe("110001");
  });

  it("learns paging from the page's own page-2 request", () => {
    const o: Observed = { filters: {}, modeHeaders: {}, addTemplates: {} };
    const base = "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?f=journey%3Astandard&q=rice";
    observe(o, base, { authorization: "a" });
    observeSearchAnswer(o, base, { items: [{ uid: 1 }], page: { has_next: true, next_id: "2" }, meta: { nextPageToken: "TOK" } });
    observe(o, `${base}&page_id=TOK&page_size=50&page_type=cursor`, { authorization: "a" });
    expect(o.paging).toEqual({ idFrom: "meta.nextPageToken", params: { page_size: "50", page_type: "cursor" } });
    expect(pathOfValue({ items: [{ id: "2" }], page: { next_id: "2" } }, "2")).toBe("page.next_id");
    expect(valueAt({ page: { next_id: 2 } }, "page.next_id")).toBe("2");
  });

  it("learns paging even when page 2's filter differs from page 1's", () => {
    const o: Observed = { filters: {}, modeHeaders: {}, addTemplates: {} };
    const p1 = "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?f=journey%3Aquickcommerce%3A%3A%3Astore_ids%3A1%7C%7C1%3A%3A%3AsearchType%3Aglobal&q=rice";
    observe(o, p1, { authorization: "a" });
    observeSearchAnswer(o, p1, { items: [], page: { has_next: true }, meta: { nextPageToken: "TOK" } });
    observe(o, "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?f=journey%3Aquickcommerce&q=rice&page_id=TOK&page_size=50", { authorization: "a" });
    expect(o.paging).toEqual({ idFrom: "meta.nextPageToken", params: { page_size: "50" } });
    expect(o.filters.quick).toContain("searchType:global"); // page-2 requests don't replace the learnt filter
  });

  it("reports a page-2 request it can't explain", () => {
    const o: Observed = { filters: {}, modeHeaders: {}, addTemplates: {} };
    observe(o, "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?q=rice&page_id=XYZ&page_no=2", { authorization: "a" });
    expect(o.paging).toBeUndefined();
    expect(o.pagingUnmatched).toEqual({ params: ["page_no"], idLength: 3, answers: 0 });
  });

  it("learns what the page's own add sends in each mode, and adds the same way", () => {
    const o: Observed = { filters: {}, modeHeaders: {}, addTemplates: {} };
    observe(o, "https://www.jiomart.com/ext/vertex/application/api/v1.0/products?f=journey%3Astandard%3A%3A%3Astore_ids%3A9%7C%7C9&q=strainer", { authorization: "a" });
    const pageAdd = {
      items: [{ item_id: 55, item_size: "OS", quantity: 1, seller_id: 7, article_id: "art55", meta: { vertical_code: "HOME", compute_delivery_fee: true, journey: "standard" }, extra_meta: { is_tradein_opted: false } }],
      pincode_source: "user",
    };
    observe(o, "https://www.jiomart.com/api/service/application/cart/v2.0/bulk-detail?id=c1&journey=standard", { authorization: "a" }, undefined, JSON.stringify(pageAdd));
    const tpl = o.addTemplates.all!;
    expect(tpl).toEqual({
      query: { journey: "standard" },
      item: { meta: { vertical_code: "HOME", compute_delivery_fee: true, journey: "standard" }, extra_meta: { is_tradein_opted: false } },
      top: { pincode_source: "user" },
    });
    expect(o.addTemplates.quick).toBeUndefined();
    const product = { ...parseSearch(SEARCH)!.products[1] };
    expect(addBody(product, 2, tpl)).toEqual({
      pincode_source: "user",
      items: [{ item_id: 7507147, item_size: "5 KG", quantity: 2, seller_id: 1, meta: { vertical_code: "GROCERIES", compute_delivery_fee: true, journey: "standard" }, extra_meta: { is_tradein_opted: false } }],
    });
    expect(describeTemplate(tpl)).toContain("item.meta.journey=standard");
    expect(addTemplateFrom("not a url", pageAdd)).toBeUndefined();
  });

  it("drops browser-set and signature headers", () => {
    expect(pageHeaders({ authorization: "a", "x-fp-signature": "s", "x-fp-date": "d", "sec-ch-ua": "x", referer: "r", "visitor-id": "v" })).toEqual({ authorization: "a", "visitor-id": "v" });
    expect(modeOfFilter("journey:standard")).toBe("all");
    expect(modeOfFilter("journey:quickcommerce:::store_ids:1||1")).toBe("quick");
  });
});

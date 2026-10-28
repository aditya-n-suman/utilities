import { describe, expect, it } from "vitest";
import type { Capture, CapturedRequest } from "../../src/research/capture.ts";
import { addCandidate } from "../../src/research/classify.ts";
import { addBody, addedLine, cartId, cartQuantity, cartWriteOk, removeBody, searchItems, withCartId } from "../../src/research/jiomart.ts";
import { REDACTED } from "../../src/research/redact.ts";
import { outline } from "../../src/research/shape.ts";
import { safeUrl } from "../../src/research/summarize.ts";

// Shapes as seen in the Phase 0 capture (trimmed).
const SEARCH = {
  items: [
    {
      type: "product",
      uid: 132487249,
      name: "Aashirvaad Shudh Whole Wheat Chakki Atta 5 kg",
      brand: { name: "aashirvaad" },
      sizes: ["OS"],
      sellable: true,
      attributes: { "vertical-code": "GROCERIES", "max-qty-in-order": "2", "product-size": "5 kg" },
      moq: { minimum: 1, maximum: 2, increment_unit: 1 },
      price: { effective: { min: 245, max: 245 }, marked: { min: 262, max: 262 } },
      seller_id: 1,
    },
    { type: "product", uid: 1, name: "No size", sellable: true },
  ],
  page: { has_next: true, next_id: "2" },
};

const ADD_RESPONSE = {
  cart_id: "c1",
  success: true,
  message: "Product has been added to cart",
  identifiers: {
    sHqFskWmSHmFnbSndB8NNA: { quantity: 1, item_index: 2, item_id: 7507147, article_id: "692794663dcd7ab2ae455d36" },
  },
};

describe("jiomart requests", () => {
  it("reads search items", () => {
    expect(searchItems(SEARCH)).toEqual([
      {
        uid: 132487249,
        name: "Aashirvaad Shudh Whole Wheat Chakki Atta 5 kg",
        brand: "aashirvaad",
        size: "OS",
        price: 245,
        mrp: 262,
        sellable: true,
        maxQty: 2,
        verticalCode: "GROCERIES",
        sellerId: 1,
      },
    ]);
    expect(searchItems({})).toEqual([]);
  });

  it("builds the add body as the page sends it", () => {
    const [item] = searchItems(SEARCH);
    expect(addBody(item, 2)).toEqual({
      items: [
        {
          item_id: 132487249,
          item_size: "OS",
          quantity: 2,
          seller_id: 1,
          meta: { vertical_code: "GROCERIES", compute_delivery_fee: true },
          extra_meta: { is_tradein_opted: false },
        },
      ],
    });
  });

  it("builds the remove body from the add response", () => {
    const item = { ...searchItems(SEARCH)[0], uid: 7507147, size: "5 KG" };
    const line = addedLine(ADD_RESPONSE, 7507147)!;
    expect(line).toEqual({ identifier: "sHqFskWmSHmFnbSndB8NNA", articleId: "692794663dcd7ab2ae455d36", itemIndex: 2, quantity: 1 });
    expect(removeBody(item, line)).toMatchObject({
      operation: "remove_item",
      item: { article_id: "692794663dcd7ab2ae455d36", item_id: 7507147, identifiers: { identifier: "sHqFskWmSHmFnbSndB8NNA" }, item_size: "5 KG", quantity: 0, item_index: 2 },
    });
    expect(addedLine(ADD_RESPONSE, 1)).toBeUndefined();
  });

  it("reads the cart", () => {
    const cart = { id: "c1", items: [{ product: { uid: 5 }, quantity: 2 }, { product: { uid: 6 }, quantity: 1 }] };
    expect(cartId(cart)).toBe("c1");
    expect(cartQuantity(cart, 5)).toBe(2);
    expect(cartQuantity(cart, 7)).toBe(0);
    expect(cartWriteOk(200, ADD_RESPONSE)).toBe(true);
    expect(cartWriteOk(200, { success: false, message: "Failed to remove item from cart" })).toBe(false);
    expect(withCartId("https://www.jiomart.com/api/service/application/cart/v2.0/bulk-detail?id=old", "c1")).toBe(
      "https://www.jiomart.com/api/service/application/cart/v2.0/bulk-detail?id=c1",
    );
  });
});

describe("Phase 0 run fixes", () => {
  const req = (seq: number, method: string, url: string, reqBody: string, resBody: string): CapturedRequest => ({
    seq, t: 0, step: "add", method, url, resourceType: "xhr", siteHost: true, reqHeaders: {}, reqBody, resBody, status: 200,
  });

  it("picks the add, not the removal that came first", () => {
    const c: Capture = {
      dir: "d",
      site: "jiomart",
      steps: [],
      requests: [
        req(1, "PUT", "https://www.jiomart.com/api/service/application/cart/v2.0/detail?id=c", '{"operation":"remove_item"}', '{"message":"Item removed from cart"}'),
        req(2, "POST", "https://www.jiomart.com/api/service/application/cart/v2.0/bulk-detail?id=c", '{"items":[]}', '{"message":"Product has been added to cart"}'),
      ],
    };
    expect(addCandidate(c)?.seq).toBe(2);
  });

  it("redacts area codes, pincode-like values and coordinates", () => {
    expect(safeUrl("https://www.jiomart.com/cart/detail?area_code=122505&b=true")).toBe(`www.jiomart.com/cart/detail?area_code=${REDACTED}&b=true`);
    expect(safeUrl("https://www.jiomart.com/x?pc=122505")).toBe(`www.jiomart.com/x?pc=${REDACTED}`);
    const text = outline({ long_lat: [76.9489, 28.4], strategy: [{ distance: 728.6 }], geo: "x" });
    expect(text).toContain(`long_lat: [2] of number ${REDACTED}`);
    expect(text).not.toContain("76.9489");
    expect(text).toContain(`geo: string ${REDACTED}`);
  });
});

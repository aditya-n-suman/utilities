// What Phase 0 learned about JioMart's own requests (see research/jiomart-api.md), as request builders and
// response readers. The probe uses them to add one new product and remove it again; Phase 2's adapter starts here.
//
// Search  GET  /ext/vertex/application/api/v1.0/products?f=…&q=<words>[&page_id=<next_id>&page_size=50]
// Cart    GET  /api/service/application/cart/v1.0/detail?…                → { id, items[{ product.uid, quantity }] }
// Add     POST /api/service/application/cart/v2.0/bulk-detail?id=<cart>   { items: [{ item_id, item_size, quantity, … }] }
// Remove  PUT  /api/service/application/cart/v2.0/detail?id=<cart>        { operation: "remove_item", item: {…} }

import { isPlainObject } from "./shape.ts";

export interface SearchItem {
  uid: number;
  name: string;
  brand?: string;
  /** item_size for the cart: the product's size code, e.g. "5 KG" or "OS" */
  size: string;
  price?: number;
  mrp?: number;
  sellable: boolean;
  maxQty?: number;
  verticalCode: string;
  sellerId: number;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (isPlainObject(v) ? v : {});
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(+v) ? +v : undefined);

export function searchItems(json: unknown): SearchItem[] {
  const items = obj(json).items;
  if (!Array.isArray(items)) return [];
  return items.filter(isPlainObject).flatMap((it) => {
    const uid = num(it.uid);
    const sizes = Array.isArray(it.sizes) ? it.sizes : [];
    if (uid === undefined || typeof it.name !== "string" || typeof sizes[0] !== "string") return [];
    const price = obj(it.price);
    const attrs = obj(it.attributes);
    return [
      {
        uid,
        name: it.name,
        brand: typeof obj(it.brand).name === "string" ? (obj(it.brand).name as string) : undefined,
        size: sizes[0],
        price: num(obj(price.effective).min),
        mrp: num(obj(price.marked).min),
        sellable: it.sellable !== false,
        maxQty: num(obj(it.moq).maximum) ?? num(attrs["max-qty-in-order"]),
        verticalCode: typeof attrs["vertical-code"] === "string" ? (attrs["vertical-code"] as string) : "GROCERIES",
        sellerId: num(it.seller_id) ?? 1,
      },
    ];
  });
}

export function cartId(json: unknown): string | undefined {
  const o = obj(json);
  for (const k of ["id", "cart_id", "uid"]) if (typeof o[k] === "string" && o[k]) return o[k] as string;
  return undefined;
}

/** Quantity of a product in a cart-detail response (0 if absent). */
export function cartQuantity(json: unknown, uid: number): number {
  const items = obj(json).items;
  if (!Array.isArray(items)) return 0;
  return items
    .filter(isPlainObject)
    .filter((i) => num(obj(i.product).uid) === uid)
    .reduce((n, i) => n + (num(i.quantity) ?? 0), 0);
}

export function addBody(item: SearchItem, quantity: number): Json {
  return {
    items: [
      {
        item_id: item.uid,
        item_size: item.size,
        quantity,
        seller_id: item.sellerId,
        meta: { vertical_code: item.verticalCode, compute_delivery_fee: true },
        extra_meta: { is_tradein_opted: false },
      },
    ],
  };
}

export interface AddedLine {
  identifier: string;
  articleId: string;
  itemIndex: number;
  quantity: number;
}

/** The cart line an add created, from the add response's `identifiers` map. */
export function addedLine(json: unknown, uid: number): AddedLine | undefined {
  for (const [identifier, v] of Object.entries(obj(obj(json).identifiers))) {
    const line = obj(v);
    if (num(line.item_id) === uid && typeof line.article_id === "string") {
      return { identifier, articleId: line.article_id, itemIndex: num(line.item_index) ?? 0, quantity: num(line.quantity) ?? 0 };
    }
  }
  return undefined;
}

export function removeBody(item: SearchItem, line: AddedLine): Json {
  return {
    operation: "remove_item",
    item: {
      article_id: line.articleId,
      item_id: item.uid,
      identifiers: { identifier: line.identifier },
      item_size: item.size,
      quantity: 0,
      parent_item_identifiers: { identifier: null, parent_item_size: null, parent_item_id: null },
      meta: { vertical_code: item.verticalCode, compute_delivery_fee: true },
      item_index: line.itemIndex,
      extra_meta: { is_tradein_opted: false },
    },
  };
}

/** JioMart answers 200 with `success: false` when a cart change didn't happen. */
export function cartWriteOk(status: number, json: unknown): boolean {
  return status >= 200 && status < 300 && obj(json).success === true;
}

/** Replaces the `id` query value (the cart id) in a captured cart URL. */
export function withCartId(url: string, id: string): string {
  const u = new URL(url);
  u.searchParams.set("id", id);
  return u.toString();
}

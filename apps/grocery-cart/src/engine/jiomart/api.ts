// JioMart's own requests (mapped in research/jiomart-api.md) as request builders and response readers.
// Pure: no network, no browser, so the extension can reuse it.
//
// Search  GET  /ext/vertex/application/api/v1.0/products?f=<filter>&q=<words>[&page_id=…&page_size=50]
// Cart    GET  /api/service/application/cart/v1.0/detail?<the page's query>   → { id, items[…] }
// Add     POST /api/service/application/cart/v2.0/bulk-detail?id=<cart>      { items: [{ item_id, item_size, quantity, … }] }
// Change  PUT  /api/service/application/cart/v2.0/detail?id=<cart>           { operation: "update_item" | "remove_item", item }
// Cart writes answer HTTP 200 with `success: false` when nothing changed.

import { type Amount, normalizeUnit, parseAmount } from "../units.ts";

export const ORIGIN = "https://www.jiomart.com";
export const SEARCH_PATH = "/ext/vertex/application/api/v1.0/products";
export const CART_DETAIL_PATH = "/api/service/application/cart/v1.0/detail";
export const ADD_PATH = "/api/service/application/cart/v2.0/bulk-detail";
export const CHANGE_PATH = "/api/service/application/cart/v2.0/detail";
/** Seen when the cart page loads; assumed to answer 401/403 when signed out (to confirm in a live run). */
export const PROFILE_PATH = "/api/service/application/user/profile/v1.0/user-attributes";
/** Pages the app opens in the tab. The cart page path is unconfirmed. */
export const HOME_URL = `${ORIGIN}/`;
export const CART_PAGE_PATH = "/checkout/cart";

/** "quick": JioMart Quick (nearby store, fast delivery). "all": Shop all (scheduled delivery, wider range). */
export type Mode = "quick" | "all";

export interface Product {
  uid: number;
  name: string;
  brand?: string;
  /** item_size for the cart: the product's size code, e.g. "5 KG" or "OS" */
  size: string;
  /** contents of one pack, when JioMart states it as a weight or volume */
  pack?: Amount;
  /** pieces in one pack (net quantity in "Pieces") */
  pieces?: number;
  /** JioMart's own size label, e.g. "5 kg" */
  packText?: string;
  price?: number;
  mrp?: number;
  /** JioMart's price per unit label, e.g. "49.00/kg" */
  perUnitText?: string;
  sellable: boolean;
  maxQty?: number;
  minQty: number;
  categories: string[];
  image?: string;
  slug?: string;
  journey?: string;
  verticalCode: string;
  sellerId: number;
  /** other pack sizes of the same product */
  variants: { uid: number; label: string; available: boolean }[];
  /** the delivery mode it was found in (set by the client's search) */
  mode?: Mode;
}

/** @deprecated name used by the Phase 0 probe */
export type SearchItem = Product;

export interface SearchPage {
  products: Product[];
  total?: number;
  /** pass to the next search call as page_id; undefined when there is no next page */
  next?: string;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Json => (isObj(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(+v) ? +v : undefined;

/** Pieces in one pack from the name: "(Set of 3)", "Pack of 2", "6 pcs". */
export function piecesFromName(name: string): number | undefined {
  const m = /\b(?:set|pack|combo)\s+of\s+(\d+)\b|\b(\d+)\s*(?:pcs|pieces|pc)\b/i.exec(name);
  const n = m ? Number(m[1] ?? m[2]) : undefined;
  return n && n > 1 ? n : undefined;
}

/** The first weight or volume in a name: "… Pressure Cooker 5 Ltr / ISI Certified / 5 Year Warranty" → 5 L. */
export function sizeFromName(name: string): Amount | undefined {
  for (const m of name.matchAll(/(\d+(?:\.\d+)?)\s*(kgs?|gms?|g|ml|ltrs?|litres?|liters?|l)\b/gi)) {
    const a = parseAmount(`${m[1]} ${m[2]}`);
    if (a) return a;
  }
  return undefined;
}

function packOf(it: Json, attrs: Json): { pack?: Amount; pieces?: number } {
  const name = str(it.name) ?? "";
  const value = num(it["net-quantity-value"]);
  const unitText = str(it["net-quantity-unit"]);
  const namedPieces = piecesFromName(name);
  if (value && unitText) {
    if (/^pieces?$|^pcs?$|^nos?$/i.test(unitText)) return { pieces: value, pack: sizeFromName(name) };
    const unit = normalizeUnit(unitText);
    if (unit) return { pack: { value, unit }, pieces: namedPieces };
  }
  // JioMart's size label, else a size in the name (it isn't always last: "5 Ltr / … / 5 Year Warranty").
  const pack = parseAmount(str(attrs["product-size"]) ?? "") ?? sizeFromName(name);
  return { pack, pieces: namedPieces };
}

export function parseProduct(v: unknown): Product | undefined {
  const it = obj(v);
  const uid = num(it.uid);
  const name = str(it.name);
  const size = str(arr(it.sizes)[0]);
  if (uid === undefined || !name || !size) return undefined;
  const attrs = obj(it.attributes);
  const price = obj(it.price);
  const moq = obj(it.moq);
  const categories = ["l1-category", "l2-category", "l3-category"].flatMap((k) => arr(attrs[k]).filter((c): c is string => typeof c === "string"));
  return {
    uid,
    name,
    brand: str(obj(it.brand).name),
    size,
    ...packOf(it, attrs),
    packText: str(attrs["product-size"]),
    price: num(obj(price.effective).min),
    mrp: num(obj(price.marked).min),
    perUnitText: str(it.net_quantity),
    sellable: it.sellable !== false,
    maxQty: num(moq.maximum) ?? num(attrs["max-qty-in-order"]),
    minQty: num(moq.minimum) ?? 1,
    categories,
    image: str(obj(arr(it.medias)[0]).url),
    slug: str(it.slug),
    journey: str(it.journey),
    verticalCode: str(attrs["vertical-code"]) ?? "GROCERIES",
    sellerId: num(it.seller_id) ?? 1,
    variants: arr(obj(arr(it.variants)[0]).items).flatMap((x) => {
      const o = obj(x);
      const vuid = num(o.uid);
      const label = str(o.value);
      return vuid !== undefined && label ? [{ uid: vuid, label, available: o.is_available !== false }] : [];
    }),
  };
}

export function parseSearch(json: unknown): SearchPage | undefined {
  const o = obj(json);
  if (!Array.isArray(o.items)) return undefined;
  const page = obj(o.page);
  const products = o.items.map(parseProduct).filter((p): p is Product => !!p);
  const next = page.has_next === true ? (str(obj(o.meta).nextPageToken) ?? str(page.next_id)) : undefined;
  return { products, total: num(page.item_total), next };
}

/** @deprecated Phase 0 probe helper */
export function searchItems(json: unknown): Product[] {
  return parseSearch(json)?.products ?? [];
}

/** The search filter for a mode. Quick is known from Phase 0; Shop all is settled by the second recording. */
export function quickFilter(storeId: string): string {
  return `journey:quickcommerce:::store_ids:${storeId}||${storeId}`;
}

/** Store id from a quick filter the page sent ("journey:quickcommerce:::store_ids:13895||13895" → "13895"). */
export function storeFromFilter(f: string): string | undefined {
  return /store_ids:(\d+)/.exec(f)?.[1];
}

/**
 * How the page asks for the next search page, learnt from the page itself (src/local/jiomart-tab.ts):
 * `page_id` is the value at `idFrom` in the previous answer, sent along with `params` (e.g. page_size).
 */
export interface Paging {
  idFrom: string;
  params: Record<string, string>;
}

export function searchUrl(
  filter: string | undefined,
  query: string,
  pageId?: string,
  pageSize = 50,
  origin = ORIGIN,
  params?: Record<string, string>,
): string {
  const u = new URL(SEARCH_PATH, origin);
  if (filter) u.searchParams.set("f", filter);
  if (pageId) {
    u.searchParams.set("page_id", pageId);
    for (const [k, v] of Object.entries(params ?? { page_size: String(pageSize) })) u.searchParams.set(k, v);
  }
  u.searchParams.set("q", query);
  return u.toString();
}

/** The string at a dotted path ("meta.nextPageToken", "page.next_id") in a JSON value. */
export function valueAt(json: unknown, path: string): string | undefined {
  let v: unknown = json;
  for (const k of path.split(".")) v = obj(v)[k];
  return typeof v === "number" ? String(v) : str(v);
}

/** The first path (outside the product and filter lists) whose value equals `value`. */
export function pathOfValue(json: unknown, value: string, path = ""): string | undefined {
  if ((typeof json === "string" || typeof json === "number") && String(json) === value) return path || undefined;
  if (!isObj(json)) return undefined;
  for (const [k, v] of Object.entries(json)) {
    if (k === "items" || k === "filters") continue;
    const found = pathOfValue(v, value, path ? `${path}.${k}` : k);
    if (found) return found;
  }
  return undefined;
}

// --- cart ---

export interface CartLine {
  uid: number;
  name?: string;
  size: string;
  quantity: number;
  identifier: string;
  articleId: string;
  itemIndex: number;
  outOfStock?: boolean;
  /** how many more JioMart can sell */
  sellableQuantity?: number;
  journey?: string;
  verticalCode: string;
  image?: string;
  brand?: string;
  /** price of one, as the cart shows it */
  price?: number;
  mrp?: number;
}

export interface Cart {
  id: string;
  lines: CartLine[];
  total?: number;
  mrpTotal?: number;
}

export function parseCart(json: unknown): Cart | undefined {
  const o = obj(json);
  const id = cartId(o);
  if (!id) return undefined;
  const lines = arr(o.items).flatMap((x, i): CartLine[] => {
    const it = obj(x);
    const product = obj(it.product);
    const article = obj(it.article);
    const uid = num(product.uid);
    const identifier = str(obj(it.identifiers).identifier);
    const articleId = str(article.uid);
    if (uid === undefined || !identifier || !articleId) return [];
    const availability = obj(it.availability);
    return [
      {
        uid,
        name: str(product.name),
        size: str(article.size) ?? "OS",
        quantity: num(it.quantity) ?? 0,
        identifier,
        articleId,
        itemIndex: num(it.res_item_index) ?? i,
        outOfStock: typeof availability.out_of_stock === "boolean" ? availability.out_of_stock : undefined,
        sellableQuantity: num(availability.sellable_quantity),
        journey: str(obj(arr(it.journey_wise_promise)[0]).journey),
        verticalCode: str(obj(article.meta).vertical_code) ?? "GROCERIES",
        image: str(obj(arr(product.images)[0]).url),
        brand: str(obj(product.brand).name),
        price: num(obj(obj(it.price).base).effective),
        mrp: num(obj(obj(it.price).base).marked),
      },
    ];
  });
  const raw = obj(obj(o.breakup_values).raw);
  return { id, lines, total: num(raw.total), mrpTotal: num(raw.mrp_total) };
}

export function cartId(json: unknown): string | undefined {
  const o = obj(json);
  for (const k of ["id", "cart_id", "uid"]) if (str(o[k])) return o[k] as string;
  return undefined;
}

/** Quantity of a product in a cart-detail response (0 if absent). */
export function cartQuantity(json: unknown, uid: number): number {
  return arr(obj(json).items)
    .map(obj)
    .filter((i) => num(obj(i.product).uid) === uid)
    .reduce((n, i) => n + (num(i.quantity) ?? 0), 0);
}

export function addBody(item: Pick<Product, "uid" | "size" | "sellerId" | "verticalCode">, quantity: number): Json {
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

/** The cart line an add created or changed, from a write response's `identifiers` map. */
export function addedLine(json: unknown, uid: number): AddedLine | undefined {
  for (const [identifier, v] of Object.entries(obj(obj(json).identifiers))) {
    const line = obj(v);
    const articleId = str(line.article_id);
    if (num(line.item_id) === uid && articleId) {
      return { identifier, articleId, itemIndex: num(line.item_index) ?? 0, quantity: num(line.quantity) ?? 0 };
    }
  }
  return undefined;
}

function changeItem(
  line: { uid: number; size: string; identifier: string; articleId: string; itemIndex: number },
  quantity: number,
  verticalCode: string,
): Json {
  return {
    article_id: line.articleId,
    item_id: line.uid,
    identifiers: { identifier: line.identifier },
    item_size: line.size,
    quantity,
    parent_item_identifiers: { identifier: null, parent_item_size: null, parent_item_id: null },
    meta: { vertical_code: verticalCode, compute_delivery_fee: true },
    item_index: line.itemIndex,
    extra_meta: { is_tradein_opted: false },
  };
}

export function updateBody(line: Parameters<typeof changeItem>[0] & { verticalCode: string }, quantity: number): Json {
  return { item: changeItem(line, quantity, line.verticalCode), operation: "update_item" };
}

export function removeBody(item: Pick<Product, "uid" | "size" | "verticalCode">, line: AddedLine, verticalCode = item.verticalCode): Json {
  return { operation: "remove_item", item: changeItem({ ...line, uid: item.uid, size: item.size }, 0, verticalCode) };
}

/** JioMart answers 200 with `success: false` when a cart change didn't happen. */
export function cartWriteOk(status: number, json: unknown): boolean {
  return status >= 200 && status < 300 && obj(json).success === true;
}

export function writeMessage(json: unknown): string | undefined {
  return str(obj(json).message);
}

/** Sets the `id` query value (the cart id) in a cart URL. */
export function withCartId(url: string, id: string): string {
  const u = new URL(url);
  u.searchParams.set("id", id);
  return u.toString();
}

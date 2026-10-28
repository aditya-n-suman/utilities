# JioMart: what its web page sends (Phase 0, 2026-10-28)

From one recorded session (signed in, pincode set, Chrome on Fedora): search "atta", scroll, add "Fortune Chakki
Fresh Atta 5 kg", +1, open cart, remove. 328 requests, 99 to `www.jiomart.com`. The raw capture stays on the
user's machine; this file keeps only what Phase 2 needs. JioMart's storefront runs on Fynd's platform (the
`/api/service/application/...` paths and `x-fp-*` headers are Fynd's).

## Headers the page adds
Every API call carries `authorization`, `visitor-id`, `x-currency-code`, `x-fp-date`, `x-fp-sdk-version`,
`x-fp-signature`, `x-geolocation`, `x-location-detail`, plus the session cookies.
- **Search works without any of them** (replayed with only cookies: same 12 products).
- Cart writes: unknown yet. `cart-probe` tries without `x-fp-signature`/`x-fp-date` first, then with the captured ones.

## Search
`GET /ext/vertex/application/api/v1.0/products?f=<filter>&q=<words>` (first page, 12 items), then
`&page_id=<page.next_id>&page_size=50` for more. Replay with new words from the tab: ✅ (toor dal → 12 toor dal products).
`f` is a filter string the page sets; not decoded yet (the cart probe prints it).

Per item (fields we'll use):
| Field | Example | Use |
|---|---|---|
| `uid` | 132487249 | cart `item_id` |
| `name` | Aashirvaad Shudh Whole Wheat Chakki Atta 5 kg | matching, display |
| `brand.name` | aashirvaad | matching |
| `sizes[0]` | `OS` (one size) | cart `item_size` (to confirm: the added Fortune pack used `5 KG`) |
| `net-quantity-value` / `-unit` | 5 / kg | pack maths |
| `attributes.product-size` | 5 kg | pack maths fallback |
| `price.effective.min` / `price.marked.min` | 245 / 262 | price, MRP |
| `net_quantity` | 49.00/kg | price per unit |
| `sellable`, `in_stock_variant` | true / false | stock (meaning of `in_stock_variant` unclear: false on a sellable item) |
| `moq.maximum`, `attributes.max-qty-in-order` | 2 | per-order limit |
| `medias[0].url` | image | display |
| `attributes.l1/l2/l3-category` | Cooking Essentials / Atta, Flours & Sooji / Atta | matching (category sanity check) |
| `variants[].items[]` | other pack sizes (`value: "5 kg"`, `is_available`) | alternatives |
`page`: `{ has_next, item_total: 278, type: "cursor", next_id }`.

Also seen: `GET /ext/vertex/application/api/v1.0/auto-complete?q=atta` (suggestions), and
`POST /api/service/application/catalog/v1.0/products/sizes/price` with `{ items: [{ slug, size: "5 KG" }] }`, which
returns the store, seller, `article_id`, live price and store `quantity` (stock) per product.

## Cart
- `GET /api/service/application/cart/v1.0/detail?area_code=<pincode>&b=true&i=true` → `{ id, items: [{ product: { uid, name }, quantity, availability: { out_of_stock, deliverable, sellable_quantity }, moq, price }], breakup_values.raw: { subtotal, total, mrp_total, … } }`
- `GET /api/service/application/cart/v1.0/basic` → `{ user_cart_items_count }`
- **Add**: `POST /api/service/application/cart/v2.0/bulk-detail?id=<cart id>`
  ```json
  { "items": [{ "item_id": 7507147, "item_size": "5 KG", "quantity": 1, "seller_id": 1,
                "meta": { "vertical_code": "GROCERIES", "compute_delivery_fee": true },
                "extra_meta": { "is_tradein_opted": false } }] }
  ```
  → `{ success: true, message: "Product has been added to cart", identifiers: { <line id>: { item_id, article_id, item_index, quantity } } }`.
  `items` is a list, so a whole basket could go in one request (to test).
- **Change quantity / remove**: `PUT /api/service/application/cart/v2.0/detail?id=<cart id>` with
  `{ operation: "remove_item" | …, item: { article_id, item_id, identifiers: { identifier: <line id> }, item_size, quantity, item_index, … } }`.
  The +1 step used the same PUT (operation not captured in the summary; to check).
- Failures come back as HTTP 200 with `success: false` (e.g. "Failed to remove item from cart"), so check `success`.

## Probe results
- Search replay with new words, with and without the page's headers: ✅ both.
- `probe --add` replayed the wrong request (a `remove_item` the page sent just before the add) and JioMart answered
  "Failed to remove item from cart"; the cart didn't change. Fixed: the add pick now prefers a write whose response
  says "added" and skips removals.
- Built add + remove of a new product: run `./instruction.sh cart-probe` (results go here).

## Other hosts (not needed)
Google Analytics, AppsFlyer, Moloco, JioMart's ad server (`ads.jiomartjcp.com`, sponsored products), image CDNs.
Sponsored results come from the ad server, not the search response, so search results are organic.

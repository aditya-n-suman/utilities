# JioMart: what its web page sends (Phase 0, 2026-10-28)

From one recorded session (signed in, pincode set, Chrome on Fedora): search "atta", scroll, add "Fortune Chakki
Fresh Atta 5 kg", +1, open cart, remove. 328 requests, 99 to `www.jiomart.com`. The raw capture stays on the
user's machine; this file keeps only what Phase 2 needs. JioMart's storefront runs on Fynd's platform (the
`/api/service/application/...` paths and `x-fp-*` headers are Fynd's).

## Headers the page adds
Every API call carries `authorization`, `visitor-id`, `x-currency-code`, `x-fp-date`, `x-fp-sdk-version`,
`x-fp-signature`, `x-geolocation`, `x-location-detail`, plus the session cookies.
- **Search works without any of them** (replayed with only cookies: same 12 products).
- **Cart writes work without `x-fp-signature`/`x-fp-date`** (cart probe, 2026-10-28). They were sent with the other
  captured headers (`authorization`, `visitor-id`, `x-location-detail`, …); whether those are needed is untested. Phase 2
  doesn't need to know: it copies them from the page's own live requests (the page polls the cart constantly).

## Search
`GET /ext/vertex/application/api/v1.0/products?f=<filter>&q=<words>` (first page, 12 items), then
`&page_id=<page.next_id>&page_size=50` for more. Replay with new words from the tab: ✅ (toor dal → 12 toor dal products).
`f` is `journey:quickcommerce:::store_ids:<store>||<store>`: results limited to quick delivery from the nearby
store picked for the pincode. Open: kitchenware (pressure cooker, containers) may only be sold with standard delivery
and so be missing from these results; try `journey:standard` or no `f` in Phase 2.

Per item (fields we'll use):
| Field | Example | Use |
|---|---|---|
| `uid` | 132487249 | cart `item_id` |
| `name` | Aashirvaad Shudh Whole Wheat Chakki Atta 5 kg | matching, display |
| `brand.name` | aashirvaad | matching |
| `sizes[0]` | `OS`, `5 KG` | cart `item_size` (confirmed: the probe added "Loose Toor Dal" with `OS`; the page added the Fortune pack with `5 KG`) |
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
  The +1 step is the same PUT with `operation: "update_item"` and the new `quantity` → "Item updated to cart".
- Failures come back as HTTP 200 with `success: false` (e.g. "Failed to remove item from cart"), so check `success`.

## Probe results
- Search replay with new words, with and without the page's headers: ✅ both.
- `probe --add` replayed the wrong request (a `remove_item` the page sent just before the add) and JioMart answered
  "Failed to remove item from cart"; the cart didn't change. Fixed: the add pick now prefers a write whose response
  says "added" and skips removals.
- Cart probe (search "toor dal" → pick the first sellable → add → check → remove → check), all ✅:
  ```
  - search filter `f`: `journey:quickcommerce:::store_ids:<store>||<store>`
  - picked: Loose Toor Dal Value 1 kg (size `OS`, ₹156.5, max 6)
  - ✅ add without the signature headers: status 200, "Product has been added to cart"
  - ✅ cart now has 1 of it
  - ✅ remove: status 200, "Item removed from cart"
  - ✅ cart is back to how it was
  ```
  It picked a *loose* product: the matcher has to rank (Phase 3), not take the first sellable result.

## Other hosts (not needed)
Google Analytics, AppsFlyer, Moloco, JioMart's ad server (`ads.jiomartjcp.com`, sponsored products), image CDNs.
Sponsored results come from the ad server, not the search response, so search results are organic.

## Live check (2026-10-28, `live-check --cart`)
- **Filters:** Quick `journey:quickcommerce:::store_ids:<s>||<s>:::searchType:global`; Shop all
  `journey:standard:::store_ids:<s2>||<s2>` (a different store id). Headers are identical in both modes; the page keeps
  the mode in site storage (`journey`, `userJourney`, `activeTab`, …), and only the filter changes in search.
- **Reach:** "atta" 281 results in Quick vs 8,679 in Shop all; "pressure cooker 5 L" 6 vs 314. Kitchenware needs Shop all.
- **Paging:** sending `page_id=<meta.nextPageToken>&page_size=50` returned the first page again (40 asked → 12
  distinct). The client now stops when a page brings nothing new. `./instruction.sh paging` reads the Phase 0 capture
  to see what the page itself sent as `page_id`.
- **Cart:** adds work in both modes. A product found in Shop all was added with `journey quickcommerce` (it's also
  stocked nearby; JioMart picks the fulfilment). Changing the quantity to 2 failed for both test products with
  "Product is out of stock": probably real (one unit in the nearby store); the live check now prints the line's
  sellable quantity to confirm. The check didn't reach its removal step, so it left both products in the cart; it now
  always removes.
- **Names:** sizes aren't always last ("… Cooker 5 Ltr / ISI Certified / 5 Year Warranty"), and sets matter
  ("(Set of 3)", "2 pcs."). Both are read now.

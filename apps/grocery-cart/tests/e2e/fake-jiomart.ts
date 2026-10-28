// A stand-in for JioMart, shaped like the Phase 0 capture (research/jiomart-api.md), for the e2e tests.
// - The page polls the cart with its own headers (authorization, x-location-detail) like the real one, has
//   "Quick" / "Shop all" switches and a search box. Quick searches send `f=journey:quickcommerce:::store_ids:…`;
//   Shop all searches send no `f` and a different x-location-detail.
// - Kitchenware is only sold in Shop all.
// - API calls need the session cookie and the authorization header; `requireSignature` makes writes need
//   x-fp-signature too (used by the Phase 0b cart probe test).

import { createServer } from "node:http";

const AUTH = "Bearer app-token";
const STORE = "13895";

const base = (uid: number, name: string, size: string, journey: string, sellable = true, vertical = "GROCERIES", price = 179, maxQty = 4) => ({
  type: "product",
  uid,
  name,
  sizes: [size],
  sellable,
  journey,
  brand: { name: name.split(" ")[0].toLowerCase() },
  attributes: { "vertical-code": vertical, "max-qty-in-order": String(maxQty) },
  price: { effective: { min: price, max: price }, marked: { min: Math.round(price * 1.15), max: Math.round(price * 1.15) } },
  moq: { minimum: 1, maximum: maxQty, increment_unit: 1 },
  seller_id: 1,
  medias: [{ url: `/img/${uid}.svg`, type: "image" }],
});

const ITEMS = [
  base(7001, "Loose Toor Dal Value 1 kg", "OS", "quickcommerce", false),
  base(7507147, "Tata Sampann Unpolished Toor Dal 1 kg", "1 KG", "quickcommerce"),
  base(7600001, "Aashirvaad Atta 5 kg", "OS", "quickcommerce", true, "GROCERIES", 289),
  base(7600002, "Pillsbury Chakki Fresh Atta 5 kg", "OS", "quickcommerce", true, "GROCERIES", 275),
  base(7600010, "Fortune Kachi Ghani Mustard Oil 1 L", "OS", "quickcommerce", true, "GROCERIES", 178, 6),
  base(7600011, "Fortune Kachi Ghani Mustard Oil 5 L", "OS", "quickcommerce", true, "GROCERIES", 849, 2),
  base(7600020, "Catch Jeera Whole 100 g", "OS", "quickcommerce", true, "GROCERIES", 62),
  base(7600030, "Cello Plastic Storage Container 1 kg", "OS", "quickcommerce", true, "HOMEANDKITCHEN", 115, 4),
  base(9100001, "Hawkins Pressure Cooker 5 L", "OS", "standard", true, "HOMEANDKITCHEN", 1795),
  base(9100003, "Prestige Popular Pressure Cooker 3 L", "OS", "standard", true, "HOMEANDKITCHEN", 1499),
  base(9100002, "Steel Tea Strainer", "OS", "standard", true, "HOMEANDKITCHEN", 99),
];

const PAGE = `<!doctype html><meta charset="utf-8"><title>JioMart stand-in</title>
<button id="quick">Quick</button><button id="all">Shop all</button>
<input id="q"><button id="go">Search</button><button id="more">More</button><button id="add">Add first</button><ul id="results"></ul>
<script>
let mode = "quick";
const headers = () => ({ authorization: ${JSON.stringify(AUTH)}, "x-location-detail": mode === "quick" ? "loc-quick" : "loc-all",
  "x-fp-signature": "v1.1:" + Math.random(), "x-fp-date": "20261028T000000Z" });
const poll = () => fetch("/api/service/application/cart/v1.0/detail?area_code=000000&b=true&i=true", { headers: headers() });
poll(); setInterval(poll, 1000);
document.getElementById("quick").onclick = () => { mode = "quick"; document.cookie = "journey=quick; path=/"; };
document.getElementById("all").onclick = () => { mode = "all"; document.cookie = "journey=all; path=/"; };
let last, lastQuery = "";
const search = async (extra) => {
  const f = mode === "quick" ? "&f=" + encodeURIComponent("journey:quickcommerce:::store_ids:${STORE}||${STORE}") : "";
  last = await (await fetch("/ext/vertex/application/api/v1.0/products?q=" + lastQuery + f + extra, { headers: headers() })).json();
  document.getElementById("results").innerHTML += last.items.map((i) => "<li>" + i.name + "</li>").join("");
};
document.getElementById("go").onclick = () => {
  lastQuery = encodeURIComponent(document.getElementById("q").value);
  document.getElementById("results").innerHTML = "";
  return search("");
};
// Scrolling: the page sends the token from the last answer, plus page_size and page_type.
document.getElementById("more").onclick = () =>
  last && last.page.has_next && search("&page_id=" + encodeURIComponent(last.meta.nextPageToken) + "&page_size=50&page_type=cursor");
// Adding from the results: in Shop all the page says so, in the URL and in meta (as the real one may).
document.getElementById("add").onclick = () => {
  const it = last.items[0];
  const all = mode === "all";
  return fetch("/api/service/application/cart/v2.0/bulk-detail?id=cart0001" + (all ? "&journey=standard" : ""), {
    method: "POST",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify({ items: [{ item_id: it.uid, item_size: it.sizes[0], quantity: 1, seller_id: 1,
      meta: { vertical_code: it.attributes["vertical-code"], compute_delivery_fee: true, ...(all ? { journey: "standard" } : {}) },
      extra_meta: { is_tradein_opted: false } }] }),
  });
};
</script>`;

export async function startFakeJioMart(opts: { requireSignature?: boolean } = {}) {
  const cart = new Map<number, { identifier: string; article_id: string; quantity: number; size: string; vertical: string; journey: string }>();
  const writes: { path: string; signed: boolean; body: unknown; location?: string }[] = [];
  const CART = "cart0001";
  let lineSeq = 0;
  /** set humanCheckNext to answer the next cart write with Akamai-style 403 HTML */
  const state = { humanCheckNext: false };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (body: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html", "set-cookie": "sess=s1; Path=/" });
      return res.end(PAGE);
    }
    if (url.pathname === "/checkout/cart") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<!doctype html><title>Cart</title><h1>Cart</h1>");
    }
    const img = /^\/img\/(\d+)\.svg$/.exec(url.pathname);
    if (img) {
      const hue = Number(img[1]) % 360;
      res.writeHead(200, { "content-type": "image/svg+xml", "access-control-allow-origin": "*" });
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="hsl(${hue} 40% 85%)"/><rect x="10" y="8" width="20" height="26" rx="4" fill="hsl(${hue} 45% 45%)"/></svg>`);
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!(req.headers.cookie ?? "").includes("sess=s1") || req.headers.authorization !== AUTH) return send({ message: "unauthorised" }, 401);
      if (state.humanCheckNext && url.pathname.startsWith("/api/service/application/cart/v2.0/")) {
        state.humanCheckNext = false;
        res.writeHead(403, { "content-type": "text/html" });
        return res.end("<html><body>Access Denied</body></html>");
      }
      const signed = typeof req.headers["x-fp-signature"] === "string";
      const location = req.headers["x-location-detail"] as string | undefined;
      if (url.pathname === "/api/service/application/user/profile/v1.0/user-attributes") return send({ attributes: {} });
      if (url.pathname === "/ext/vertex/application/api/v1.0/products") {
        const words = (url.searchParams.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        const f = url.searchParams.get("f");
        const quick = f === `journey:quickcommerce:::store_ids:${STORE}||${STORE}`;
        if (f !== null && !quick) return send({ items: [], page: { has_next: false, item_total: 0 } });
        const items = ITEMS.filter((i) => (quick ? i.journey === "quickcommerce" : true) && words.every((w) => i.name.toLowerCase().includes(w)));
        const abs = items.map((i) => ({ ...i, medias: i.medias.map((m) => ({ ...m, url: `http://${req.headers.host}${m.url}` })) }));
        // Pages of 2. Like the real site in the live check, a page_id without the page's other parameters
        // (page_type=cursor here) gets the first page again.
        const token = `tok-${url.searchParams.get("q")}`;
        const second = url.searchParams.get("page_id") === token && url.searchParams.get("page_type") === "cursor";
        const start = second ? 2 : 0;
        const end = second ? abs.length : 2;
        return send({
          items: abs.slice(start, end),
          page: { has_next: end < abs.length, next_id: "2", item_total: items.length, type: "cursor" },
          meta: { nextPageToken: token, attributionToken: "attr" },
        });
      }
      if (url.pathname === "/api/service/application/cart/v1.0/detail") {
        return send({
          id: CART,
          items: [...cart].map(([uid, l], i) => ({
            identifiers: { identifier: l.identifier },
            product: {
              uid,
              name: ITEMS.find((x) => x.uid === uid)?.name,
              images: [{ url: `http://${req.headers.host}/img/${uid}.svg` }],
            },
            price: { base: { effective: ITEMS.find((x) => x.uid === uid)?.price.effective.min, marked: ITEMS.find((x) => x.uid === uid)?.price.marked.min } },
            article: { uid: l.article_id, size: l.size, meta: { vertical_code: l.vertical } },
            quantity: l.quantity,
            availability: { out_of_stock: false, sellable_quantity: 50 },
            journey_wise_promise: [{ journey: l.journey }],
            res_item_index: i,
          })),
          breakup_values: { raw: { total: 0 } },
        });
      }
      const body = raw ? JSON.parse(raw) : undefined;
      if (req.method === "POST" && url.pathname === "/api/service/application/cart/v2.0/bulk-detail") {
        writes.push({ path: url.pathname, signed, body, location });
        if (opts.requireSignature && !signed) return send({ success: false, message: "Invalid signature" });
        const it = body.items[0];
        const known = ITEMS.find((i) => i.uid === it.item_id && i.sizes[0] === it.item_size && i.sellable);
        if (url.searchParams.get("id") !== CART || !known) return send({ success: false, message: "Item not found" });
        // Without the page's Shop all marker an add is a Quick add, and Quick doesn't stock Shop-all-only items.
        const journey = url.searchParams.get("journey") === "standard" && it.meta?.journey === "standard" ? "standard" : "quickcommerce";
        if (known.journey === "standard" && journey !== "standard") return send({ success: false, message: "Product is out of stock" });
        const line = cart.get(it.item_id) ?? {
          identifier: `id${++lineSeq}`,
          article_id: `art${it.item_id}`,
          quantity: 0,
          size: it.item_size,
          vertical: it.meta.vertical_code,
          journey,
        };
        line.quantity += it.quantity;
        if (line.quantity > known.moq.maximum) return send({ success: false, message: `You can add maximum ${known.moq.maximum} quantity` });
        cart.set(it.item_id, line);
        return send({
          cart_id: CART,
          success: true,
          message: "Product has been added to cart",
          identifiers: { [line.identifier]: { quantity: line.quantity, item_index: 0, item_id: it.item_id, article_id: line.article_id } },
        });
      }
      if (req.method === "PUT" && url.pathname === "/api/service/application/cart/v2.0/detail") {
        writes.push({ path: url.pathname, signed, body, location });
        const it = body.item;
        const line = cart.get(it.item_id);
        if (!line || line.identifier !== it.identifiers.identifier || line.article_id !== it.article_id) {
          return send({ success: false, message: body.operation === "remove_item" ? "Failed to remove item from cart" : "Failed to update item" });
        }
        if (body.operation === "remove_item") cart.delete(it.item_id);
        else if (body.operation === "update_item") line.quantity = it.quantity;
        else return send({ success: false, message: "Unknown operation" });
        return send({ cart_id: CART, success: true, message: body.operation === "remove_item" ? "Item removed from cart" : "Item updated to cart", identifiers: {} });
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, cart, writes, auth: AUTH, state, close: () => new Promise<void>((r) => server.close(() => r())) };
}

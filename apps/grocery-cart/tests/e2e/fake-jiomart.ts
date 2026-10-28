// A stand-in for the JioMart endpoints the cart probe uses, with the response shapes seen in the Phase 0
// capture (research/jiomart-api.md). `requireSignature` makes writes need the x-fp-signature header.

import { createServer } from "node:http";

const ITEMS = [
  { uid: 7001, name: "Loose Toor Dal Value 1 kg", sizes: ["OS"], sellable: false },
  { uid: 7507147, name: "Tata Sampann Unpolished Toor Dal 1 kg", sizes: ["1 KG"], sellable: true },
].map((i) => ({
  ...i,
  type: "product",
  brand: { name: "tata sampann" },
  attributes: { "vertical-code": "GROCERIES", "max-qty-in-order": "4" },
  price: { effective: { min: 179, max: 179 }, marked: { min: 210, max: 210 } },
  moq: { minimum: 1, maximum: 4, increment_unit: 1 },
  seller_id: 1,
}));

export async function startFakeJioMart(opts: { requireSignature: boolean }) {
  const cart = new Map<number, { identifier: string; article_id: string; quantity: number; size: string }>();
  const writes: { path: string; signed: boolean; body: unknown }[] = [];
  const CART = "cart0001";
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (body: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html", "set-cookie": "sess=s1; Path=/" });
      return res.end("<!doctype html><title>JioMart stand-in</title>");
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const signed = typeof req.headers["x-fp-signature"] === "string";
      if (url.pathname === "/ext/vertex/application/api/v1.0/products") {
        const words = (url.searchParams.get("q") ?? "").toLowerCase().split(/\s+/);
        return send({ items: ITEMS.filter((i) => words.every((w) => i.name.toLowerCase().includes(w))), page: { has_next: false } });
      }
      if (url.pathname === "/api/service/application/cart/v1.0/detail") {
        return send({ id: CART, items: [...cart].map(([uid, l]) => ({ product: { uid }, quantity: l.quantity })) });
      }
      const body = raw ? JSON.parse(raw) : undefined;
      if (req.method === "POST" && url.pathname === "/api/service/application/cart/v2.0/bulk-detail") {
        writes.push({ path: url.pathname, signed, body });
        if (opts.requireSignature && !signed) return send({ success: false, message: "Invalid signature" });
        const it = body.items[0];
        const known = ITEMS.find((i) => i.uid === it.item_id && i.sizes[0] === it.item_size);
        if (url.searchParams.get("id") !== CART || !known) return send({ success: false, message: "Item not found" });
        const line = { identifier: "idABC", article_id: "art123", quantity: it.quantity, size: it.item_size };
        cart.set(it.item_id, line);
        return send({
          cart_id: CART,
          success: true,
          message: "Product has been added to cart",
          identifiers: { [line.identifier]: { quantity: 1, item_index: 0, item_id: it.item_id, article_id: line.article_id } },
        });
      }
      if (req.method === "PUT" && url.pathname === "/api/service/application/cart/v2.0/detail") {
        writes.push({ path: url.pathname, signed, body });
        const it = body.item;
        const line = cart.get(it.item_id);
        if (body.operation !== "remove_item" || !line || line.identifier !== it.identifiers.identifier || line.article_id !== it.article_id) {
          return send({ success: false, message: "Failed to remove item from cart" });
        }
        cart.delete(it.item_id);
        return send({ cart_id: CART, success: true, message: "Item removed from cart", identifiers: {} });
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, cart, writes, close: () => new Promise<void>((r) => server.close(() => r())) };
}

// A tiny stand-in shop for the Phase 0 end-to-end test. Like a real shop it searches and edits the cart with
// fetch() calls, needs a session cookie, and needs a custom header the page script adds (x-shop-token), so the
// probe's "with / without custom headers" check has something to find. Cart responses carry a fake name and
// phone number to check the summary redacts them.

import { createServer, type Server } from "node:http";

export const SHOP_TOKEN = "tok_5f2b9c1d8e7a6f3b2c1d9e8f7a6b5c4d";
export const SESSION = "sess_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d";

const PRODUCTS = [
  { id: 101, display_name: "Aashirvaad Shudh Chakki Atta 5 kg", price: 289, mrp: 330, pack: "5 kg", in_stock: true },
  { id: 102, display_name: "Aashirvaad Select Atta 5 kg", price: 345, mrp: 380, pack: "5 kg", in_stock: true },
  { id: 103, display_name: "Fortune Chakki Fresh Atta 10 kg", price: 520, mrp: 610, pack: "10 kg", in_stock: false },
  { id: 201, display_name: "Tata Sampann Toor Dal 1 kg", price: 179, mrp: 210, pack: "1 kg", in_stock: true },
  { id: 202, display_name: "Good Life Toor Dal 2 kg", price: 330, mrp: 380, pack: "2 kg", in_stock: true },
];

const PAGE = `<!doctype html><meta charset="utf-8"><title>Test Shop</title>
<input id="q" placeholder="Search"><button id="go">Search</button><span id="count">0</span>
<ul id="results"></ul>
<script>
const TOKEN = ${JSON.stringify(SHOP_TOKEN)};
const api = (path, body) => fetch(path, {
  method: body ? "POST" : "GET",
  headers: { "x-shop-token": TOKEN, ...(body ? { "content-type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());
const setCount = (cart) => { document.getElementById("count").textContent = String(cart.items.reduce((n, i) => n + i.qty, 0)); };
document.getElementById("go").onclick = async () => {
  const q = document.getElementById("q").value;
  const res = await api("/api/search?q=" + encodeURIComponent(q) + "&page=1&pincode=560001");
  navigator.sendBeacon("http://localhost:" + location.port + "/track", "search");
  document.getElementById("results").innerHTML = res.data.products.map((p) =>
    '<li data-id="' + p.id + '"><span class="name">' + p.display_name + '</span> ' +
    '<button class="add">Add</button><button class="plus">+</button><button class="remove">Remove</button></li>').join("");
};
document.getElementById("results").onclick = async (e) => {
  const li = e.target.closest("li"); if (!li) return;
  const id = Number(li.dataset.id);
  const action = e.target.className;
  if (action === "add") setCount((await api("/api/cart/add", { product_id: id, qty: 1 })).cart);
  if (action === "plus") setCount((await api("/api/cart/update", { product_id: id, qty: 2 })).cart);
  if (action === "remove") setCount((await api("/api/cart/remove", { product_id: id })).cart);
};
</script>`;

export interface FakeShop {
  server: Server;
  origin: string;
  cart: Map<number, number>;
  close(): Promise<void>;
}

export async function startFakeShop(): Promise<FakeShop> {
  const cart = new Map<number, number>();
  const cartJson = () => ({
    cart: {
      items: [...cart].map(([product_id, qty]) => ({ product_id, qty, name: PRODUCTS.find((p) => p.id === product_id)?.display_name })),
      customer_name: "Asha Verma",
      phone: "9876543210",
      delivery: { address: "12 MG Road, Bengaluru", note: "call 9876543210 or asha@example.com" },
    },
  });
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html", "set-cookie": `session=${SESSION}; Path=/` });
      return res.end(PAGE);
    }
    if (url.pathname === "/track") return send(204, {});
    if (!url.pathname.startsWith("/api/")) return send(404, {});
    if (!(req.headers.cookie ?? "").includes(`session=${SESSION}`)) return send(401, { error: "no session" });
    if (req.headers["x-shop-token"] !== SHOP_TOKEN) return send(401, { error: "bad token" });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as { product_id: number; qty?: number }) : undefined;
      if (url.pathname === "/api/search") {
        const words = (url.searchParams.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        const products = PRODUCTS.filter((p) => words.some((w) => p.display_name.toLowerCase().includes(w)));
        return send(200, { data: { total: products.length, products } });
      }
      if (url.pathname === "/api/cart/add" && body) cart.set(body.product_id, (cart.get(body.product_id) ?? 0) + (body.qty ?? 1));
      else if (url.pathname === "/api/cart/update" && body) cart.set(body.product_id, body.qty ?? 1);
      else if (url.pathname === "/api/cart/remove" && body) cart.delete(body.product_id);
      else if (url.pathname !== "/api/cart") return send(404, {});
      send(200, cartJson());
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    cart,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

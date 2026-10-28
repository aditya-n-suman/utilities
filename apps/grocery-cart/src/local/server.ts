// The local app's web server: the built UI (dist/ui), a small JSON API, and a live state stream (SSE).
// Listens on 127.0.0.1 only.
//
//   ./instruction.sh start          (builds the UI if needed, starts this, opens the page)

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Mode } from "../engine/jiomart/api.ts";
import { App, type AppOptions } from "./app.ts";

const UI_DIR = resolve(fileURLToPath(new URL("../../dist/ui", import.meta.url)));
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
};

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function send(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

const isMode = (m: unknown): m is Mode => m === "quick" || m === "all";

export async function handle(app: App, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  // Only answer requests addressed to this machine by name or address (blocks DNS-rebinding pages).
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? "")) return send(res, 403, { error: "wrong host" });

  if (path === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    const push = (s: unknown) => res.write(`data: ${JSON.stringify(s)}\n\n`);
    push(app.state());
    const off = app.subscribe(push);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      off();
      clearInterval(ping);
    });
    return;
  }
  if (path === "/api/state") return send(res, 200, app.state());

  if (path.startsWith("/api/")) {
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    // Same-origin page only: a browser sends this header on cross-site form posts, which have no business here.
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") return send(res, 403, { error: "cross-site request" });
    const b = await body(req).catch(() => undefined);
    if (!b) return send(res, 400, { error: "bad JSON" });
    const line = Number(b.line);
    const run = app.run;
    switch (path) {
      case "/api/check":
        await app.check();
        break;
      case "/api/open":
        await app.open(b.what === "cart" ? "cart" : "home");
        break;
      case "/api/find": {
        if (typeof b.text !== "string" || !isMode(b.mode)) return send(res, 400, { error: "text and mode needed" });
        return send(res, 200, app.find(b.text, b.mode));
      }
      case "/api/choose":
        run.choose(line, Number(b.uid));
        break;
      case "/api/packs":
        run.setPacks(line, Number(b.packs));
        break;
      case "/api/skip":
        run.skip(line, b.skipped === true);
        break;
      case "/api/remember":
        run.setRemember(line, b.remember === true);
        break;
      case "/api/search":
        void run.searchAgain(line, typeof b.words === "string" ? b.words : undefined, isMode(b.mode) ? b.mode : undefined);
        break;
      case "/api/add":
        void run.addAll(b.onlyFailed === true);
        break;
      case "/api/pause":
        run.pause();
        break;
      case "/api/resume":
        await app.resume();
        break;
      case "/api/reset":
        run.reset();
        break;
      case "/api/review":
        run.backToReview();
        break;
      case "/api/remembered/search": {
        if (typeof b.words !== "string" || !b.words.trim() || !isMode(b.mode)) return send(res, 400, { error: "words and mode needed" });
        try {
          return send(res, 200, { candidates: await app.searchForRemembered(b.words.trim(), b.mode) });
        } catch (e) {
          return send(res, 200, { error: (e as Error).message, candidates: [] });
        }
      }
      case "/api/remembered/set":
        if (!app.rememberProduct(String(b.key), Number(b.uid))) return send(res, 400, { error: "search again first" });
        break;
      case "/api/cart/load":
        await app.loadCart();
        break;
      case "/api/cart/remove": {
        const targets = Array.isArray(b.targets) ? (b.targets as { uid: unknown; toQuantity?: unknown; name?: unknown }[]) : [];
        app.tidyCart(
          targets
            .filter((t) => Number.isFinite(Number(t.uid)))
            .map((t) => ({ uid: Number(t.uid), toQuantity: Math.max(0, Number(t.toQuantity ?? 0) || 0), name: typeof t.name === "string" ? t.name : undefined })),
        );
        break;
      }
      case "/api/cart/undo-run":
        app.tidyCart(app.run.undoTargets());
        break;
      case "/api/cart/pause":
        app.tidy.pause();
        break;
      case "/api/cart/resume":
        await app.resumeTidy();
        break;
      case "/api/cart/reset":
        app.tidy.reset();
        break;
      case "/api/forget":
        app.memory.forget(String(b.key));
        app.emit();
        break;
      default:
        return send(res, 404, { error: "unknown action" });
    }
    return send(res, 200, { ok: true });
  }

  // The UI: files from dist/ui, index.html for anything else.
  if (!existsSync(UI_DIR)) {
    res.writeHead(500, { "content-type": "text/plain" });
    return void res.end("The UI isn't built. Run ./instruction.sh start (or npm run build:ui).");
  }
  const file = normalize(join(UI_DIR, decodeURIComponent(path)));
  const target = file.startsWith(UI_DIR) && existsSync(file) && statSync(file).isFile() ? file : join(UI_DIR, "index.html");
  res.writeHead(200, {
    "content-type": TYPES[extname(target)] ?? "application/octet-stream",
    "cache-control": target.includes("/assets/") ? "max-age=31536000, immutable" : "no-cache",
  });
  res.end(readFileSync(target));
}

export async function startServer(port: number, opts: AppOptions = {}): Promise<{ app: App; server: Server; url: string }> {
  const app = new App(opts);
  const server = createServer((req, res) => {
    handle(app, req, res).catch((e: unknown) => send(res, 500, { error: (e as Error).message }));
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  void app.check();
  return { app, server, url };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { port: { type: "string", default: "4180" }, endpoint: { type: "string" } } });
  const { url } = await startServer(Number(values.port), { endpoint: values.endpoint });
  console.log(`Grocery Cart is running at ${url}  (Ctrl+C to stop)`);
}

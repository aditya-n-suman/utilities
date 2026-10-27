// Records what a shop's own page sends while you use it by hand, tagged with the step you're on.
// Requests to the shop's domains, and any request carrying the search term you typed (search is sometimes a
// third-party service), are kept in full; others only as method + URL. Page loads are kept too: the shop may
// render search results into the HTML (e.g. Next.js __NEXT_DATA__) instead of fetching them.
// Used by record.ts (interactive) and by the end-to-end test (scripted).

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Request } from "playwright-core";
import type { CapturedRequest, StepMark } from "./capture.ts";
import { containsTerm } from "./classify.ts";
import { isSiteHost, type Site } from "./sites.ts";

const MAX_BODY = 2_000_000;
const RECORDED_TYPES = new Set(["document", "fetch", "xhr", "eventsource", "ping", "other"]);

export interface Recording {
  dir: string;
  mark(step: string, data?: Record<string, string>): void;
  /** Waits for requests still in flight (up to 5 s; event streams never finish) and writes steps.json. */
  stop(): Promise<{ requests: number; siteRequests: number }>;
}

export function startRecording(context: BrowserContext, site: Site, outDir: string): Recording {
  mkdirSync(outDir, { recursive: true });
  const rawPath = join(outDir, "raw.jsonl");
  writeFileSync(rawPath, "");
  const started = Date.now();
  const steps: StepMark[] = [{ step: "start", t: 0 }];
  const meta = new WeakMap<Request, { seq: number; t: number; step: string }>();
  const inflight = new Set<Request>();
  const pending = new Set<Promise<void>>();
  let seq = 0;
  let siteRequests = 0;
  let stopped = false;

  const currentStep = () => steps[steps.length - 1].step;

  const onRequest = (req: Request) => {
    if (stopped) return;
    meta.set(req, { seq: ++seq, t: Date.now() - started, step: currentStep() });
    if (RECORDED_TYPES.has(req.resourceType())) inflight.add(req);
  };

  const save = async (req: Request, failure?: string) => {
    const m = meta.get(req);
    if (!m || !RECORDED_TYPES.has(req.resourceType())) return;
    let host = "";
    try {
      host = new URL(req.url()).hostname;
    } catch {
      return;
    }
    const entry: CapturedRequest = {
      ...m,
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      siteHost: isSiteHost(site, host),
    };
    const term = [...steps].reverse().find((s) => s.data?.term)?.data?.term;
    const full = entry.siteHost || (term !== undefined && containsTerm({ ...entry, reqBody: req.postData() ?? undefined }, term));
    if (full) {
      if (entry.siteHost) siteRequests++;
      entry.reqHeaders = await req.allHeaders().catch(() => req.headers());
      entry.reqBody = req.postData() ?? undefined;
      const res = await req.response().catch(() => null);
      if (res) {
        entry.status = res.status();
        entry.resHeaders = await res.allHeaders().catch(() => res.headers());
        const type = entry.resHeaders["content-type"] ?? "";
        if (/json|text|javascript|xml/i.test(type) || type === "") {
          const body = await res.body().catch(() => undefined);
          if (body === undefined) entry.resBodyNote = "body unavailable";
          else if (body.length > MAX_BODY) entry.resBodyNote = `body too large (${body.length} bytes)`;
          else entry.resBody = body.toString("utf8");
        } else {
          entry.resBodyNote = `not kept (${type})`;
        }
      }
    }
    if (failure) entry.failure = failure;
    appendFileSync(rawPath, `${JSON.stringify(entry)}\n`);
  };

  const track = (p: Promise<void>) => {
    pending.add(p);
    void p.finally(() => pending.delete(p));
  };
  const onFinished = (req: Request) => {
    inflight.delete(req);
    track(save(req).catch(() => undefined));
  };
  const onFailed = (req: Request) => {
    inflight.delete(req);
    track(save(req, req.failure()?.errorText ?? "failed").catch(() => undefined));
  };

  context.on("request", onRequest);
  context.on("requestfinished", onFinished);
  context.on("requestfailed", onFailed);

  return {
    dir: outDir,
    mark(step, data) {
      steps.push({ step, t: Date.now() - started, ...(data ? { data } : {}) });
      writeFileSync(join(outDir, "steps.json"), JSON.stringify(steps, null, 2));
    },
    async stop() {
      stopped = true;
      const deadline = Date.now() + 5000;
      while (inflight.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      await Promise.race([Promise.all([...pending]), new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now())))]);
      context.off("request", onRequest);
      context.off("requestfinished", onFinished);
      context.off("requestfailed", onFailed);
      writeFileSync(join(outDir, "steps.json"), JSON.stringify(steps, null, 2));
      return { requests: seq, siteRequests };
    },
  };
}

export function captureDirName(site: Site, now = new Date()): string {
  return `${site.id}-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
}

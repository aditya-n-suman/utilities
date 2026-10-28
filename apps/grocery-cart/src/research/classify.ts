// Picks the interesting requests out of a capture:
// - search candidates: fully recorded requests whose URL or body carries the typed search term, ranked by whether
//   the response (JSON, or JSON embedded in a server-rendered page) contains the product name typed in the add step;
// - cart candidates: site requests sent while adding, changing or removing, that write (non-GET) or name a cart.
// The probe replays the top candidates, so the ranking decides what gets tested.

import type { Capture, CapturedRequest } from "./capture.ts";
import { stepData } from "./capture.ts";
import { findStringPaths, parseJson, responseJson } from "./shape.ts";

export const CART_STEPS = ["add", "increase", "remove"];

export interface SearchCandidate {
  req: CapturedRequest;
  score: number;
  /** where the added product's name appears in the response */
  productPaths: string[];
}

export function termVariants(term: string): string[] {
  const variants = new Set([
    term,
    encodeURIComponent(term),
    encodeURIComponent(term).replace(/%20/g, "+"),
    term.replace(/ /g, "+"),
  ]);
  return [...variants].filter(Boolean);
}

export function containsTerm(req: Pick<CapturedRequest, "url" | "reqBody">, term: string): boolean {
  const hay = `${req.url}\n${req.reqBody ?? ""}`.toLowerCase();
  return termVariants(term.toLowerCase()).some((v) => hay.includes(v.toLowerCase()));
}

export function searchCandidates(c: Capture): SearchCandidate[] {
  const term = stepData(c, "search", "term");
  if (!term) return [];
  const product = stepData(c, "add", "product");
  const out: SearchCandidate[] = [];
  for (const req of c.requests) {
    if (!req.reqHeaders || !containsTerm(req, term)) continue;
    const json = responseJson(req.resBody);
    const productPaths = product && json !== undefined ? findStringPaths(json, product) : [];
    let score = 0;
    if (json !== undefined) score += 2;
    if (productPaths.length) score += 5;
    if (req.step === "search" || req.step === "scroll") score += 1;
    if (req.status && req.status >= 200 && req.status < 300) score += 1;
    if (req.resourceType === "fetch" || req.resourceType === "xhr") score += 1;
    out.push({ req, score, productPaths });
  }
  return out.sort((a, b) => b.score - a.score || a.req.seq - b.req.seq);
}

export function cartCandidates(c: Capture): CapturedRequest[] {
  const seen = new Set<string>();
  return c.requests.filter((r) => {
    if (!r.siteHost || !CART_STEPS.includes(r.step) || (r.resourceType !== "fetch" && r.resourceType !== "xhr")) return false;
    if (r.method === "GET" && !/cart|basket|bag/i.test(r.url)) return false;
    // One example per endpoint and step: the page polls the cart many times.
    const key = `${r.step} ${r.method} ${r.url.split("?")[0]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The request the probe replays for an add: a write during the add step, preferring one whose response says
 * something was added, and avoiding removals (shops often tidy the cart just before adding).
 */
export function addCandidate(c: Capture): CapturedRequest | undefined {
  const score = (r: CapturedRequest) =>
    (/\badd(ed)?\b/i.test(r.resBody ?? "") ? 5 : 0) +
    (/remove|delete/i.test(r.reqBody ?? "") ? -10 : 0) +
    (r.method === "POST" ? 2 : 0) +
    (/cart|basket|bag/i.test(r.url) ? 1 : 0);
  return c.requests
    .filter((r) => r.siteHost && r.step === "add" && r.method !== "GET")
    .sort((a, b) => score(b) - score(a) || a.seq - b.seq)[0];
}

function replaceIn(s: string, term: string, next: string): string {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return s.replace(re, () => next);
}

/** Swaps the search term in a URL's path segments and query values, keeping the URL's encoding. */
export function replaceTermInUrl(url: string, term: string, next: string): string {
  const u = new URL(url);
  u.pathname = u.pathname
    .split("/")
    .map((seg) => {
      const decoded = safeDecode(seg);
      return decoded.toLowerCase().includes(term.toLowerCase())
        ? encodeURIComponent(replaceIn(decoded, term, next))
        : seg;
    })
    .join("/");
  for (const [k, v] of [...u.searchParams]) {
    if (v.toLowerCase().includes(term.toLowerCase())) u.searchParams.set(k, replaceIn(v, term, next));
  }
  return u.toString();
}

/** Swaps the search term in a body: JSON strings, form fields, or plain text. */
export function replaceTermInBody(body: string, term: string, next: string): string {
  const json = parseJson(body);
  if (json !== undefined) return JSON.stringify(mapStrings(json, (s) => replaceIn(s, term, next)));
  if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body)) {
    const form = new URLSearchParams(body);
    for (const [k, v] of [...form]) form.set(k, replaceIn(v, term, next));
    return form.toString();
  }
  return replaceIn(body, term, next);
}

function mapStrings(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === "string") return f(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, f));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f)]));
  return v;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

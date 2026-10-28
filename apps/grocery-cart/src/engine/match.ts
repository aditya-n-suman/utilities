// The matcher: for one list line, rank JioMart's search results and decide how many packs to buy.
// Pure and shop-agnostic apart from the Product shape, so the extension (and DMart later) can reuse it.
//
// Score = how many of your words the name covers (with a few shop synonyms), then pack fit (an amount like 5 kg is
// best met by one 5 kg pack; over-buying costs), then small nudges: sellable, not "loose" unless asked, JioMart's
// own order. Confidence: high when every word is covered, it's sellable and the quantity fits; medium when most
// words are covered or the pack only roughly fits; low otherwise; none when nothing is left.

import type { Product } from "./jiomart/api.ts";
import type { ListItem, Quantity } from "./list.ts";
import { type Amount, toBase } from "./units.ts";

export type Confidence = "high" | "medium" | "low" | "none";

export interface Candidate {
  product: Product;
  /** packs to buy to meet the line's quantity */
  packs: number;
  /** "2 × 2.5 kg = 5 kg", "x6", "1 × pack" */
  covers: string;
  /** price × packs, when the price is known */
  lineTotal?: number;
  /** price per kg or L (or per pack), e.g. { value: 57.8, per: "kg" } */
  pricePerUnit?: { value: number; per: "kg" | "L" | "pack" };
  score: number;
  /** why it isn't a clean match, in words for the UI */
  issues: string[];
}

export interface Match {
  status: "matched" | "not_found";
  confidence: Confidence;
  chosen?: Candidate;
  /** up to 5 other candidates, best first (never the chosen one) */
  alternatives: Candidate[];
  remembered: boolean;
}

// Words that mean the same on Indian grocery sites. Each group is matched as one word.
const SYNONYMS: string[][] = [
  ["dal", "daal", "dhal"],
  ["toor", "tur", "arhar", "tuvar"],
  ["jeera", "cumin"],
  ["saunf", "fennel"],
  ["ajwain", "carom"],
  ["methi", "fenugreek"],
  ["haldi", "turmeric"],
  ["rai", "mustard"],
  ["tej", "bay"],
  ["patta", "leaf", "leaves"],
  ["suji", "sooji", "semolina", "rava", "rawa"],
  ["poha", "chura", "chiwda", "flattened"],
  ["atta", "flour"],
  ["chawal", "rice"],
  ["cheeni", "sugar"],
  ["namak", "salt"],
  ["moongfali", "peanut", "peanuts", "groundnut"],
  ["lehsun", "garlic"],
  ["adrak", "ginger"],
  ["jhadu", "broom"],
  ["kadhai", "kadai", "kadhai", "wok"],
  ["patila", "patila", "patiala", "tope", "pot"],
  ["parat", "basin"],
  ["glass", "tumbler"],
  ["container", "dabba", "jar", "canister"],
  ["dustbin", "bin"],
];
const CANON = new Map<string, string>();
for (const group of SYNONYMS) for (const w of group) if (!CANON.has(w)) CANON.set(w, group[0]);

const STOP = new Set(["of", "and", "with", "for", "the", "a", "an", "pack", "packs", "set", "pcs", "pc", "piece", "pieces", "x"]);
const UNIT_RE = /^\d+(\.\d+)?(g|gm|gms|kg|kgs|ml|l|ltr|litre|liter|ltrs)?$/;

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s+(g|gm|gms|kg|kgs|ml|l|ltr|litre|liter)\b/g, "$1$2")
    .split(/[^a-z0-9.]+/)
    .filter((w) => w && !STOP.has(w) && !UNIT_RE.test(w))
    .map((w) => CANON.get(w) ?? CANON.get(stem(w)) ?? stem(w));
}

/** A size written in the line's name ("Pressure cooker 5 L", "Container 1 kg"): it describes each piece. */
export function sizeInQuery(query: string): Amount | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|gm|ml|l|ltr|litre)\b/i.exec(query);
  if (!m) return undefined;
  const unit = m[2].toLowerCase();
  const u = unit === "kg" ? "kg" : unit === "g" || unit === "gm" ? "g" : unit === "ml" ? "ml" : "L";
  return { value: Number(m[1]), unit: u };
}

function fmtAmount(base: number, liquid: boolean): string {
  const big = base >= 1000;
  const v = big ? base / 1000 : base;
  const unit = liquid ? (big ? "L" : "ml") : big ? "kg" : "g";
  return `${+v.toFixed(2)} ${unit}`;
}

const isLiquid = (a: Amount) => a.unit === "ml" || a.unit === "L";

/** "2 × 2.5 kg = 5 kg" for amounts, "x6" for counts, "1 × pack" when the pack size isn't stated. */
export function coversText(qty: Quantity, pack: Amount | undefined, packs: number): string {
  if (qty.kind === "count") return `x${packs}`;
  if (!pack) return `${packs} × pack`;
  return `${packs} × ${+pack.value.toFixed(2)} ${pack.unit} = ${fmtAmount(toBase(pack.value, pack.unit) * packs, isLiquid(pack))}`;
}

/** Packs needed to meet a quantity, and how much that over-buys (1 = exact). */
export function packPlan(qty: Quantity, pack: Amount | undefined): { packs: number; overBuy: number } {
  if (qty.kind === "count") return { packs: qty.value, overBuy: 1 };
  if (!pack) return { packs: 1, overBuy: 1 };
  const want = toBase(qty.value, qty.unit);
  const each = toBase(pack.value, pack.unit);
  const packs = Math.max(1, Math.ceil(want / each - 1e-9));
  return { packs, overBuy: (each * packs) / want };
}

export function pricePerUnit(p: Product): Candidate["pricePerUnit"] {
  if (p.price === undefined) return undefined;
  if (!p.pack) return { value: p.price, per: "pack" };
  const per = isLiquid(p.pack) ? "L" : "kg";
  return { value: Math.round((p.price / (toBase(p.pack.value, p.pack.unit) / 1000)) * 10) / 10, per };
}

export function candidate(item: ListItem, p: Product, rank: number): Candidate {
  const want = new Set(tokens(item.query));
  const have = new Set(tokens(`${p.name} ${p.brand ?? ""} ${p.categories.join(" ")}`));
  const covered = [...want].filter((w) => have.has(w)).length;
  const coverage = want.size ? covered / want.size : 0;
  const issues: string[] = [];
  let score = coverage * 100;

  const plan = packPlan(item.qty, p.pack);
  let packs = plan.packs;
  if (item.qty.kind === "amount") {
    if (!p.pack) {
      score -= 12;
      issues.push("pack size not stated");
    } else if (plan.overBuy > 1.25) {
      score -= Math.min(30, (plan.overBuy - 1) * 25);
      issues.push(`buys ${coversText(item.qty, p.pack, packs).split("= ")[1]} for ${item.qty.value} ${item.qty.unit}`);
    } else if (packs > 1) {
      score -= Math.min(8, packs - 1); // two 2.5 kg packs are fine, one 5 kg pack is nicer
    }
  } else {
    const size = sizeInQuery(item.query);
    if (size && p.pack) {
      const ratio = toBase(p.pack.value, p.pack.unit) / toBase(size.value, size.unit);
      if (ratio < 0.8 || ratio > 1.25) {
        score -= 15;
        issues.push(`${p.pack.value} ${p.pack.unit}, not ${size.value} ${size.unit}`);
      }
    }
  }
  if (p.maxQty !== undefined && packs > p.maxQty) {
    issues.push(`JioMart sells at most ${p.maxQty} per order`);
    score -= 10;
    packs = p.maxQty;
  }
  if (!p.sellable) {
    score -= 60;
    issues.push("not available now");
  }
  if (/\bloose\b/i.test(p.name) && !/\bloose\b/i.test(item.query)) {
    score -= 15;
    issues.push("sold loose");
  }
  score -= Math.min(rank, 20) * 0.3; // JioMart's own relevance order breaks ties

  return {
    product: p,
    packs,
    covers: coversText(item.qty, p.pack, packs),
    lineTotal: p.price !== undefined ? Math.round(p.price * packs * 100) / 100 : undefined,
    pricePerUnit: pricePerUnit(p),
    score: Math.round(score * 10) / 10,
    issues: coverage < 1 ? [`doesn't mention ${[...want].filter((w) => !have.has(w)).join(", ")}`, ...issues] : issues,
  };
}

export function confidenceOf(c: Candidate | undefined): Confidence {
  if (!c || c.score < 25) return "none";
  const coverageOk = !c.issues.some((i) => i.startsWith("doesn't mention"));
  if (c.product.sellable && coverageOk && c.issues.length === 0) return "high";
  if (c.product.sellable && c.score >= 60) return "medium";
  return "low";
}

/**
 * Ranks `products` for `item`. A remembered product (by uid) is chosen when it's in the results and sellable.
 */
export function match(item: ListItem, products: Product[], remembered?: number): Match {
  const ranked = products.map((p, i) => candidate(item, p, i)).sort((a, b) => b.score - a.score);
  const usable = ranked.filter((c) => c.score >= 25);
  const rememberedCand = remembered !== undefined ? usable.find((c) => c.product.uid === remembered && c.product.sellable) : undefined;
  const chosen = rememberedCand ?? usable[0];
  if (!chosen) return { status: "not_found", confidence: "none", alternatives: [], remembered: false };
  return {
    status: "matched",
    confidence: rememberedCand ? "high" : confidenceOf(chosen),
    chosen,
    alternatives: usable.filter((c) => c !== chosen).slice(0, 5),
    remembered: !!rememberedCand,
  };
}

/** Re-plans a candidate with a different pack count (the review's − / + stepper). */
export function withPacks(c: Candidate, item: ListItem, packs: number): Candidate {
  const n = Math.max(1, Math.round(packs));
  return {
    ...c,
    packs: n,
    covers: coversText(item.qty, c.product.pack, n),
    lineTotal: c.product.price !== undefined ? Math.round(c.product.price * n * 100) / 100 : undefined,
  };
}

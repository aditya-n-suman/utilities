// Weights and volumes. Everything is compared in a base unit (grams or millilitres), and a weight and a volume are
// treated as equal (1 kg ≈ 1 L) because oils and liquids are listed either way. Shared by the list parser and,
// later, the matcher's pack maths.

export type Unit = "g" | "kg" | "ml" | "L";

const ALIASES: Record<string, Unit> = {
  g: "g",
  gm: "g",
  gms: "g",
  gr: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  mls: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "L",
  lt: "L",
  ltr: "L",
  ltrs: "L",
  litre: "L",
  litres: "L",
  liter: "L",
  liters: "L",
};

export function normalizeUnit(s: string): Unit | undefined {
  return ALIASES[s.trim().toLowerCase().replace(/\.$/, "")];
}

/** Grams or millilitres. */
export function toBase(value: number, unit: Unit): number {
  return unit === "kg" || unit === "L" ? value * 1000 : value;
}

export interface Amount {
  value: number;
  unit: Unit;
}

/** "5 kg", "500g", "1.5 Ltr" → { value, unit }; anything else → undefined. */
export function parseAmount(s: string): Amount | undefined {
  const m = /^(\d+(?:\.\d+)?)\s*([a-z.]+)$/i.exec(s.trim());
  if (!m) return undefined;
  const unit = normalizeUnit(m[2]);
  const value = Number(m[1]);
  return unit && value > 0 ? { value, unit } : undefined;
}

export function formatAmount(a: Amount): string {
  return `${a.value} ${a.unit}`;
}

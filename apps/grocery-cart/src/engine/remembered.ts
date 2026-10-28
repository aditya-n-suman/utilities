// Remembered choices: "when a line uses these words again, pick this product" (DESIGN_BRIEF.md, A7).
// The store is an interface so the local app keeps it in a JSON file and the extension in chrome.storage.

import type { Mode, Product } from "./jiomart/api.ts";

export interface Remembered {
  /** the line's words, normalised (rememberKey) */
  key: string;
  uid: number;
  name: string;
  packText?: string;
  image?: string;
  lastPrice?: number;
  mode?: Mode;
  /** YYYY-MM-DD */
  lastUsed: string;
}

export interface RememberedStore {
  all(): Remembered[];
  get(key: string): Remembered | undefined;
  set(r: Remembered): void;
  forget(key: string): void;
}

export function rememberKey(query: string): string {
  return query.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
}

export function rememberedFrom(query: string, p: Product, today: string): Remembered {
  return {
    key: rememberKey(query),
    uid: p.uid,
    name: p.name,
    packText: p.pack ? `${p.pack.value} ${p.pack.unit}` : p.packText,
    image: p.image,
    lastPrice: p.price,
    mode: p.mode,
    lastUsed: today,
  };
}

export class MemoryStore implements RememberedStore {
  protected map = new Map<string, Remembered>();
  constructor(initial: Remembered[] = []) {
    for (const r of initial) this.map.set(r.key, r);
  }
  all(): Remembered[] {
    return [...this.map.values()].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed) || a.key.localeCompare(b.key));
  }
  get(key: string): Remembered | undefined {
    return this.map.get(key);
  }
  set(r: Remembered): void {
    this.map.set(r.key, r);
  }
  forget(key: string): void {
    this.map.delete(key);
  }
}

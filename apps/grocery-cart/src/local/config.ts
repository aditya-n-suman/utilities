// Where the local app keeps its files: ~/.config/grocery-cart/ (GROCERY_CART_HOME overrides, for tests).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function configDir(): string {
  return process.env.GROCERY_CART_HOME ?? join(homedir(), ".config", "grocery-cart");
}

export function readConfig<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(configDir(), name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeConfig(name: string, value: unknown): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(join(configDir(), name), typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

export function readText(name: string): string {
  try {
    return readFileSync(join(configDir(), name), "utf8");
  } catch {
    return "";
  }
}

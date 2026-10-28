import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatQuantity, parseList, parseQuantity } from "../../src/engine/list.ts";
import { normalizeUnit, parseAmount, toBase } from "../../src/engine/units.ts";

describe("units", () => {
  it("normalises unit spellings", () => {
    expect(["g", "gm", "GMS", "grams"].map(normalizeUnit)).toEqual(["g", "g", "g", "g"]);
    expect(["kg", "Kgs", "kilo"].map(normalizeUnit)).toEqual(["kg", "kg", "kg"]);
    expect(["l", "L", "ltr", "Litre", "liters"].map(normalizeUnit)).toEqual(["L", "L", "L", "L", "L"]);
    expect(normalizeUnit("pkt")).toBeUndefined();
  });

  it("parses amounts with or without a space", () => {
    expect(parseAmount("5 kg")).toEqual({ value: 5, unit: "kg" });
    expect(parseAmount("500g")).toEqual({ value: 500, unit: "g" });
    expect(parseAmount("1.5 Ltr")).toEqual({ value: 1.5, unit: "L" });
    expect(parseAmount("0 kg")).toBeUndefined();
    expect(toBase(1.5, "L")).toBe(1500);
  });
});

describe("quantity", () => {
  it("reads counts and amounts", () => {
    expect(parseQuantity("")).toEqual({ kind: "count", value: 1 });
    expect(parseQuantity("x6")).toEqual({ kind: "count", value: 6 });
    expect(parseQuantity("X 12")).toEqual({ kind: "count", value: 12 });
    expect(parseQuantity("×2")).toEqual({ kind: "count", value: 2 });
    expect(parseQuantity("3")).toEqual({ kind: "count", value: 3 });
    expect(parseQuantity("2 pcs")).toEqual({ kind: "count", value: 2 });
    expect(parseQuantity("5 kg")).toEqual({ kind: "amount", value: 5, unit: "kg" });
    expect(parseQuantity("200 ml")).toEqual({ kind: "amount", value: 200, unit: "ml" });
  });

  it("explains what it can't read", () => {
    expect(parseQuantity("5 tbsp")).toMatch(/unknown unit/);
    expect(parseQuantity("some")).toMatch(/can't read/);
    expect(parseQuantity("x0")).toMatch(/at least 1/);
  });
});

describe("list", () => {
  it("parses lines, skipping blanks and comments", () => {
    const { items, errors } = parseList("# groceries\n\nRice ; 5 kg ; चावल\n  Tea cup small ;x6\nMatchbox\nOil ; 5 tbsp\n ; x2\nA;1;b;c");
    expect(errors).toEqual([
      { line: 6, raw: "Oil ; 5 tbsp", error: expect.stringMatching(/unknown unit/) },
      { line: 7, raw: "; x2", error: expect.stringMatching(/name is missing/) },
    ]);
    expect(items).toEqual([
      { line: 3, raw: "Rice ; 5 kg ; चावल", query: "Rice", qty: { kind: "amount", value: 5, unit: "kg" }, note: "चावल" },
      { line: 4, raw: "Tea cup small ;x6", query: "Tea cup small", qty: { kind: "count", value: 6 } },
      { line: 5, raw: "Matchbox", query: "Matchbox", qty: { kind: "count", value: 1 } },
      { line: 8, raw: "A;1;b;c", query: "A", qty: { kind: "count", value: 1 }, note: "b;c" },
    ]);
  });

  it("reads the whole example list", () => {
    const { items, errors } = parseList(readFileSync(new URL("../../examples/my-list.txt", import.meta.url), "utf8"));
    expect(errors).toEqual([]);
    expect(items).toHaveLength(65);
    const byQuery = Object.fromEntries(items.map((i) => [i.query, formatQuantity(i.qty)]));
    expect(byQuery["Pressure cooker 5 L"]).toBe("x1");
    expect(byQuery["Container 1 kg"]).toBe("x6");
    expect(byQuery["Mustard oil"]).toBe("5 L");
    expect(byQuery["Jeera"]).toBe("100 g");
    expect(items.find((i) => i.query === "Rice")?.note).toBe("चावल");
  });

  it("handles Windows line endings", () => {
    expect(parseList("Rice ; 5 kg\r\nSalt ; 1 kg\r\n").items.map((i) => i.line)).toEqual([1, 2]);
  });
});

import { describe, expect, it } from "vitest";
import { parseInline, plainText } from "./markup";

describe("parseInline", () => {
  it("parses bold, italic and links", () => {
    expect(parseInline("Cut **60%** of *load* via [docs](https://x.dev/a).")).toEqual([
      { text: "Cut " },
      { text: "60%", bold: true },
      { text: " of " },
      { text: "load", italic: true },
      { text: " via " },
      { text: "docs", href: "https://x.dev/a" },
      { text: "." },
    ]);
  });

  it("leaves HTML and unsafe links as text", () => {
    const segs = parseInline('<b>hi</b> [x](javascript:alert(1))');
    expect(segs.every((s) => !s.href && !s.bold)).toBe(true);
    expect(plainText(segs)).toBe('<b>hi</b> [x](javascript:alert(1))');
  });

  it("returns nothing for empty input", () => {
    expect(parseInline(undefined)).toEqual([]);
    expect(parseInline("")).toEqual([]);
  });
});

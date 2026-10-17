import { describe, expect, it } from "vitest";
import full from "../../schema/examples/full.json";
import { parseError, readImport } from "./ImportScreen";
import { ago } from "./storage";
import { AI_PROMPT, promptWithResume } from "./ai";
import type { Resume } from "../lib/types";

describe("readImport", () => {
  it("accepts a valid file, also inside a ```json fence an AI added", () => {
    expect(readImport(JSON.stringify(full)).k).toBe("valid");
    expect(readImport("```json\n" + JSON.stringify(full) + "\n```").k).toBe("valid");
  });
  it("reports invalid resumes with problems", () => {
    const s = readImport(JSON.stringify({ schemaVersion: "1.0", basics: { name: "A" }, work: [{ company: "c", title: "t", startDate: "Feb 2020" }] }));
    expect(s.k).toBe("invalid");
  });
  it("explains text that isn't JSON, with line and column", () => {
    const s = readImport('{\n  "a": 1,\n  oops\n}');
    expect(s.k).toBe("notjson");
    if (s.k === "notjson") expect(s.line).toBe(3);
    expect(readImport("[1,2]").k).toBe("notjson");
  });
  it("computes positions from either browser message style", () => {
    expect(parseError("ab\ncd", new SyntaxError("Unexpected token in JSON at position 4"))).toMatchObject({ line: 2, col: 2 });
    expect(parseError("", new SyntaxError("Bad thing (line 3 column 7)"))).toMatchObject({ line: 3, col: 7 });
  });
});

describe("AI prompt", () => {
  it("embeds the schema and the current resume", () => {
    expect(AI_PROMPT).toContain('"$schema": "https://json-schema.org/draft/2020-12/schema"');
    expect(AI_PROMPT).not.toContain("{{SCHEMA}}");
    expect(promptWithResume(full as unknown as Resume)).toContain('"name": "Priya Raman"');
  });
});

describe("ago", () => {
  it("reads naturally", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    expect(ago("2026-10-17T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-15T12:00:00Z", now)).toBe("2 days ago");
    expect(ago("2026-10-17T11:00:00Z", now)).toBe("1 hour ago");
  });
});

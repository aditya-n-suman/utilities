import { describe, expect, it } from "vitest";
import full from "../../schema/examples/full.json";
import minimal from "../../schema/examples/minimal.json";
import rtl from "../../schema/examples/rtl.json";
import { buildView } from "../lib/view";
import type { Resume } from "../lib/types";
import { guessDate, normalizeForForm, prepareForForm, problemsForAI, softWarnings, stats, validate } from "./validate";

const FULL = full as unknown as Resume;

describe("validate", () => {
  it.each([["full", full], ["minimal", minimal], ["rtl", rtl]])("accepts %s.json", (_, d) => {
    expect(validate(d)).toEqual({ errors: [], unknown: [], valid: true });
  });

  it("reports one plain problem per field, with fixes where it can guess", () => {
    const doc = structuredClone(FULL) as unknown as Record<string, any>;
    doc.work[0].startDate = "Mar 2024";
    doc.work[1].endDate = "now";
    doc.projects[0].url = "npmjs.com/package/lazy-remote-example";
    doc.basics.emial = doc.basics.email;
    delete doc.basics.email;
    doc.work[2].highlights[0] = "x".repeat(600);
    const v = validate(doc);
    expect(v.valid).toBe(false);
    const by = Object.fromEntries(v.errors.map((e) => [e.dot, e]));
    expect(Object.keys(by).sort()).toEqual(["projects.0.url", "work.0.startDate", "work.1.endDate", "work.2.highlights.0"]);
    expect(by["work.0.startDate"]).toMatchObject({ kind: "date", fix: "2024-03", path: "work[0].startDate", hint: 'Use "2024-03".' });
    expect(by["work.1.endDate"]).toMatchObject({ kind: "date", fix: "present" });
    expect(by["projects.0.url"]).toMatchObject({ kind: "url", fix: "https://npmjs.com/package/lazy-remote-example" });
    expect(by["work.2.highlights.0"]).toMatchObject({ kind: "length" });
    expect(v.unknown).toEqual([
      expect.objectContaining({ dot: "basics.emial", suggestion: "email", target: "basics.email", value: "priya.raman@example.com" }),
    ]);
  });

  it("explains missing required fields and empty strings the same way", () => {
    const v = validate({ schemaVersion: "1.0", basics: { name: "" }, work: [{ title: "Dev", startDate: "2020" }] });
    expect(v.errors.map((e) => [e.dot, e.kind])).toEqual([
      ["basics.name", "required"],
      ["work.0.company", "required"],
    ]);
  });

  it("guesses common date spellings", () => {
    expect(guessDate("February 2025")).toBe("2025-02");
    expect(guessDate("Feb. 2025")).toBe("2025-02");
    expect(guessDate("2/2025")).toBe("2025-02");
    expect(guessDate("Current")).toBe("present");
    expect(guessDate("someday")).toBeUndefined();
  });
});

describe("prepareForForm", () => {
  it("drops unknown keys and wrong types, keeps invalid values in place", () => {
    const { doc, dropped } = prepareForForm({
      basics: { name: "Ada", emial: "a@b.c", profiles: "github.com/ada" },
      work: [{ company: "X", title: "Y", startDate: "Jan 2020", highlights: ["Did a thing", 42] }],
      skills: [{ items: ["Go", "Rust"] }],
    });
    expect(doc.schemaVersion).toBe("1.0");
    expect(dropped.map((d) => [d.dot, d.reason])).toEqual(
      expect.arrayContaining([["basics.emial", "unknown"], ["basics.profiles", "type"], ["work.0.highlights.1", "type"]]),
    );
    expect(doc.work![0].startDate).toBe("Jan 2020");
    expect(doc.work![0].highlights).toEqual([{ text: "Did a thing" }]);
    expect(doc.skills![0].items).toEqual([{ name: "Go" }, { name: "Rust" }]);
    const v = validate(doc);
    expect(v.unknown).toEqual([]);
    expect(v.errors.map((e) => e.dot)).toEqual(["work.0.startDate"]);
    expect(() => buildView(doc)).not.toThrow();
  });

  it("survives input that isn't a resume at all", () => {
    for (const junk of [null, 42, "hi", [], { basics: [] }, { basics: { name: 7 } }]) {
      const { doc } = prepareForForm(junk);
      expect(doc.basics.name).toBe("");
      expect(() => buildView(doc)).not.toThrow();
    }
  });

  it("keeps normalised documents schema-valid", () => {
    expect(validate(normalizeForForm(FULL)).valid).toBe(true);
  });
});

describe("summaries", () => {
  it("counts what was imported", () => {
    expect(stats(FULL)).toEqual(["3 jobs", "2 projects", "4 skill groups", "1 school", "1 certification"]);
  });
  it("warns softly about missing contact details", () => {
    const d = { ...FULL, basics: { ...FULL.basics, phone: undefined } };
    expect(softWarnings(d).map((w) => w.path)).toEqual(["basics.phone"]);
  });
  it("writes a problem list an AI can act on", () => {
    const v = validate({ schemaVersion: "1.0", basics: { name: "A", emial: "x" }, work: [{ company: "c", title: "t", startDate: "May 2021" }] });
    const text = problemsForAI(v, []);
    expect(text).toContain('work[0].startDate: "May 2021" isn\'t a date we understand. Use "2021-05".');
    expect(text).toContain('basics.emial: unknown key (did you mean "email"?)');
  });
});

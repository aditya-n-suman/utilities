import { describe, expect, it } from "vitest";
import { DEFAULT_DOC, metricsFor, parseDoc, SECTION_METRICS, stepType, zoomBy } from "./doc";

describe("parseDoc", () => {
  it("returns a copy of the defaults when nothing is saved or the save is corrupt", () => {
    for (const saved of [null, "", "{not json"]) {
      const d = parseDoc(saved);
      expect(d).toEqual(DEFAULT_DOC);
      expect(d).not.toBe(DEFAULT_DOC);
      expect(d.sections).not.toBe(DEFAULT_DOC.sections);
    }
  });

  it("fills settings a saved document is missing", () => {
    const d = parseDoc(JSON.stringify({ title1: "ASHA", type: { hs: 1.2 }, ph: { z: 2 } }));
    expect(d.title1).toBe("ASHA");
    expect(d.title2).toBe(DEFAULT_DOC.title2);
    expect(d.type).toEqual({ hs: 1.2, bs: 1, ls: 1, sg: 1 });
    expect(d.ph).toEqual({ z: 2, x: 0, y: 0 });
  });
});

describe("stepType", () => {
  it("steps by 2% and clamps to 60–160%", () => {
    let t = DEFAULT_DOC.type;
    t = stepType(t, "hs", 1);
    expect(t.hs).toBe(1.02);
    for (let i = 0; i < 100; i++) t = stepType(t, "hs", 1);
    expect(t.hs).toBe(1.6);
    for (let i = 0; i < 100; i++) t = stepType(t, "bs", -1);
    expect(t.bs).toBe(0.6);
  });

  it("steps the section gap by 10% from 0 to 300%", () => {
    let t = DEFAULT_DOC.type;
    for (let i = 0; i < 3; i++) t = stepType(t, "sg", 1);
    expect(t.sg).toBe(1.3);
    for (let i = 0; i < 50; i++) t = stepType(t, "sg", -1);
    expect(t.sg).toBe(0);
  });
});

describe("zoomBy", () => {
  it("clamps zoom to 50–400% without float drift", () => {
    let p = DEFAULT_DOC.ph;
    for (let i = 0; i < 3; i++) p = zoomBy(p, 0.1);
    expect(p.z).toBe(1.3);
    expect(zoomBy({ ...p, z: 3.95 }, 0.1).z).toBe(4);
    expect(zoomBy({ ...p, z: 0.55 }, -0.1).z).toBe(0.5);
  });
});

it("uses the family-section metrics for unknown section styles", () => {
  expect(metricsFor("nope")).toBe(SECTION_METRICS.fam);
});

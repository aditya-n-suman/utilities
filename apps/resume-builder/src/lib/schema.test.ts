import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import schema from "../../schema/resume.schema.json";
import full from "../../schema/examples/full.json";
import minimal from "../../schema/examples/minimal.json";
import rtl from "../../schema/examples/rtl.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

describe("resume.schema.json", () => {
  it.each([["full", full], ["minimal", minimal], ["rtl", rtl]])("accepts examples/%s.json", (_, doc) => {
    expect(validate(doc), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("rejects typos, human dates and unknown end dates", () => {
    const bad = {
      schemaVersion: "1.0",
      basics: { name: "X", emial: "a@b.c" },
      work: [{ company: "A", title: "B", startDate: "Feb 2025", endDate: "now" }],
    };
    expect(validate(bad)).toBe(false);
    const paths = (validate.errors ?? []).map((e) => e.instancePath);
    expect(paths).toContain("/basics");
    expect(paths).toContain("/work/0/startDate");
    expect(paths).toContain("/work/0/endDate");
  });

  it("allows x- extension keys", () => {
    expect(validate({ schemaVersion: "1.0", basics: { name: "X" }, "x-notes": ["check dates"] })).toBe(true);
  });
});

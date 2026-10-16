import { describe, expect, it } from "vitest";
import full from "../../schema/examples/full.json";
import minimal from "../../schema/examples/minimal.json";
import rtl from "../../schema/examples/rtl.json";
import { formatDate, formatRange, initialsOf } from "./format";
import type { Resume } from "./types";
import { buildView, type Section } from "./view";

const FULL = full as unknown as Resume;
const MIN = minimal as unknown as Resume;
const RTL = rtl as unknown as Resume;
const find = <K extends Section["kind"]>(v: { sections: Section[] }, kind: K) =>
  v.sections.find((s) => s.kind === kind) as Extract<Section, { kind: K }>;

describe("dates", () => {
  it("formats partial ISO dates", () => {
    expect(formatDate("2025-02", "MMM YYYY", "en-US")).toBe("Feb 2025");
    expect(formatDate("2025-02", "MMMM YYYY", "en-US")).toBe("February 2025");
    expect(formatDate("2025-02", "MM/YYYY", "en-US")).toBe("02/2025");
    expect(formatDate("2025", "MMM YYYY", "en-US")).toBe("2025");
    expect(formatDate("present", "MMM YYYY", "en-US")).toBe("Present");
    expect(formatDate("present", "MMM YYYY", "ar-AE")).toBe("حتى الآن");
    expect(formatDate("Feb 2025", "MMM YYYY", "en-US")).toBe("Feb 2025");
  });
  it("joins ranges and single dates", () => {
    expect(formatRange("2021-07", "2024-03", "MMM YYYY", "en-US")).toBe("Jul 2021 – Mar 2024");
    expect(formatRange(undefined, "2025", "MMM YYYY", "en-US")).toBe("2025");
  });
});

describe("buildView", () => {
  it("follows sectionOrder, hiddenSections and sectionTitles", () => {
    const v = buildView(FULL, { template: "ledger" });
    const keys = v.sections.map((s) => s.key);
    expect(keys.slice(0, 6)).toEqual(["summary", "work", "projects", "skills", "education", "custom:talks"]);
    expect(keys).not.toContain("references");
    expect(v.sections.find((s) => s.key === "work")!.title).toBe("Professional Experience");
    expect(v.sections.find((s) => s.key === "certifications")!.title).toBe("Certifications");
  });

  it("groups consecutive roles at one company with the full span", () => {
    const work = find(buildView(FULL), "work");
    expect(work.groups.map((g) => g.roles.length)).toEqual([2, 1]);
    expect(work.groups[0].dates).toBe("Jul 2021 – Present");
    expect(work.items[0].where).toBe("Bengaluru, Karnataka · Hybrid");
    expect(work.items[0].bullets[0]).toMatchObject({ label: "Core Web Vitals", path: "work.0.highlights.0" });
    expect(work.items[0].bullets[2].label).toBeUndefined();
  });

  it("splits sections into main and side columns for Meridian", () => {
    const v = buildView(FULL, { template: "meridian" });
    expect(v.main.map((s) => s.key)).toEqual(["summary", "work", "custom:talks", "publications", "volunteer"]);
    expect(v.side.map((s) => s.key)).toContain("skills");
    const one = buildView(FULL, { template: "ledger" });
    expect(one.side).toEqual([]);
  });

  it("picks the avatar slot", () => {
    const withPhoto: Resume = { ...FULL, basics: { ...FULL.basics, photo: { src: "data:image/png;base64,AA" } } };
    expect(buildView(FULL, { template: "meridian" }).slot).toBe("initials");
    expect(buildView(withPhoto, { template: "meridian" }).slot).toBe("photo");
    expect(buildView(withPhoto, { template: "meridian", avatar: "initials" }).slot).toBe("initials");
    expect(buildView(withPhoto, { template: "meridian", avatar: "none" }).slot).toBe("none");
    expect(buildView(withPhoto, { template: "ledger" }).slot).toBe("none");
  });

  it("derives initials and contrast-safe text on the accent", () => {
    expect(initialsOf("sam okafor")).toBe("SO");
    expect(buildView(MIN, { template: "meridian" }).initials).toBe("SO");
    expect(buildView(MIN, { accent: "#FFE066" }).onAccent).toBe("#111111");
    expect(buildView(MIN, { accent: "#1A73E8" }).onAccent).toBe("#FFFFFF");
  });

  it("shows skill levels only when asked and the template supports them", () => {
    const lv = (opts: Parameters<typeof buildView>[1]) => find(buildView(FULL, opts), "skills").groups[0].items[0].level;
    expect(lv({ template: "meridian" })).toBeUndefined();
    expect(lv({ template: "meridian", showSkillLevels: true })).toBe(5);
    expect(lv({ template: "ledger", showSkillLevels: true })).toBeUndefined();
  });

  it("goes right to left for Arabic", () => {
    const v = buildView(RTL, { template: "ledger" });
    expect(v.dir).toBe("rtl");
    expect(v.lang).toBe("ar-AE");
    expect(find(v, "work").items[0].dates).toMatch(/حتى الآن$/);
    expect(find(v, "work").items[0].where).toBe("دبي · هجين");
    expect(v.sections[0].title).toBe("نبذة");
  });

  it("gives every contact a link target where one exists", () => {
    const v = buildView(FULL);
    expect(v.contacts.map((c) => c.href)).toEqual(["tel:+919876543210", "mailto:priya.raman@example.com", undefined, "https://priyaraman.example.dev"]);
    expect(v.profiles.map((p) => p.short)).toEqual(["LinkedIn", "GitHub", "npm"]);
  });

  it("falls back to Meridian for unknown or unbuilt templates", () => {
    expect(buildView(MIN, { template: "harbor" }).template.id).toBe("meridian");
    expect(buildView(MIN, { template: "nope" }).template.id).toBe("meridian");
  });

  it("renders a document with only a name", () => {
    const v = buildView({ schemaVersion: "1.0", basics: { name: "Ada" } });
    expect(v.sections).toEqual([]);
    expect(v.contacts).toEqual([]);
  });
});

describe("Arabic locations", () => {
  it("join with the Arabic comma", () => {
    const v = buildView(RTL);
    expect(v.contacts.find((c) => c.path === "basics.location")!.text).toBe("دبي، الإمارات العربية المتحدة");
  });
});

import { describe, expect, it } from "vitest";
import full from "../../../schema/examples/full.json";
import type { Resume } from "../../lib/types";
import { itemOf, labelFor, sectionOf, toForm, toPreview } from "./pathmap";

const doc = full as unknown as Resume;

describe("click-to-edit path mapping", () => {
  it.each([
    ["work.0.highlights.1.text", "work.0.highlights.1"],
    ["work.0.startDate", "work.0.dates"],
    ["work.0.location.city", "work.0.location"],
    ["work.0.workMode", "work.0.location"],
    ["basics.location.region", "basics.location"],
    ["basics.profiles.1.url", "basics.profiles.1"],
    ["education.0.score.max", "education.0.score"],
    ["education.0.field", "education.0.degree"],
    ["preferences.sectionTitles.work", "section:work"],
    ["customSections.0.title", "section:custom:talks"],
  ])("form %s shows as %s", (form, preview) => expect(toPreview(form, doc)).toBe(preview));

  it.each([
    ["work.0.highlights.1", "work.0.highlights.1.text"],
    ["work.0.dates", "work.0.startDate"],
    ["work.2", "work.2.title"],
    ["education.0", "education.0.institution"],
    ["projects.1", "projects.1.name"],
    ["basics.initials", "basics.photo"],
    ["section:custom:talks", "customSections.0.title"],
    ["customSections.0.items.0", "customSections.0.items.0.title"],
  ])("preview %s focuses %s", (preview, form) => expect(toForm(preview, doc)).toBe(form));

  it("finds the section card and item", () => {
    expect(sectionOf("basics.summary", doc)).toBe("summary");
    expect(sectionOf("basics.email", doc)).toBe("basics");
    expect(sectionOf("customSections.0.items.0.title", doc)).toBe("custom:talks");
    expect(sectionOf("section:skills", doc)).toBe("skills");
    expect(itemOf("work.2.highlights.0")).toBe(2);
    expect(itemOf("customSections.0.items.3")).toBe(3);
    expect(itemOf("basics.name")).toBe(-1);
  });

  it("labels hover outlines", () => {
    expect(labelFor("work.0.highlights.1")).toBe("Bullet 2");
    expect(labelFor("work.0.title")).toBe("Job title");
    expect(labelFor("section:work")).toBe("Section heading");
  });
});

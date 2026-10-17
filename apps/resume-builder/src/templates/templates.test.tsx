import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import full from "../../schema/examples/full.json";
import minimal from "../../schema/examples/minimal.json";
import rtl from "../../schema/examples/rtl.json";
import { pageFit } from "../pages/TemplatesPage";
import type { Resume } from "../lib/types";
import { buildView } from "../lib/view";
import { READY_TEMPLATES } from "./registry";
import { ResumePage } from "./ResumePage";

const DOCS = { full, minimal, rtl } as unknown as Record<string, Resume>;
const html = (doc: Resume, template: string, extra = {}) => renderToStaticMarkup(<ResumePage vm={buildView(doc, { template, ...extra })} />);

describe.each(READY_TEMPLATES.map((t) => t.id))("%s", (id) => {
  it.each(Object.keys(DOCS))("renders %s.json without gaps", (name) => {
    const out = html(DOCS[name], id);
    expect(out).toContain(`data-template="${id}"`);
    expect(out).not.toMatch(/undefined|NaN|\[object Object\]/);
    expect(out).toContain(DOCS[name].basics.name);
  });

  it("prints every section's content from full.json", () => {
    const out = html(DOCS.full, id);
    for (const text of ["Orbit Commerce", "Staff Frontend Engineer", "Mar 2024 – Present", "Core Web Vitals:", "lazy-remote", "Module Federation",
      "National Institute of Technology Trichy", "8.4", "AWS Certified Developer", "Engineering Excellence Award", "Measuring INP", "Tamil",
      "Women Who Code", "Carnatic music", "Micro-frontends without the micro-pain", "Professional Experience"]) {
      expect(out, text).toContain(text);
    }
    expect(out).not.toContain("References available on request"); // hidden in preferences
    expect(out).toContain('href="mailto:priya.raman@example.com"');
    expect(out).toContain("<strong>190 ms</strong>");
  });

  it("sets direction and language on the page", () => {
    const out = html(DOCS.rtl, id);
    expect(out).toMatch(/^<div class="folio-page" dir="rtl" lang="ar-AE"/);
  });

  it("passes text and spacing scale to the page", () => {
    const out = html(DOCS.full, id, { textScale: 0.9, spacingScale: 0.7 });
    expect(out).toContain("--text-scale:0.9;--space-scale:0.7");
  });

  it("puts a data-path on every work bullet for click-to-edit", () => {
    const out = html(DOCS.full, id);
    for (let w = 0; w < 3; w++) expect(out).toContain(`data-path="work.${w}.highlights.0"`);
  });
});

describe("Meridian avatar slot", () => {
  const photo: Resume = { ...DOCS.full, basics: { ...DOCS.full.basics, photo: { src: "data:image/png;base64,AA", alt: "Priya" } } };
  it("shows the photo, the initials or nothing", () => {
    expect(html(photo, "meridian")).toContain('<img class="mer-avatar mer-photo"');
    expect(html(photo, "meridian", { avatar: "initials" })).toContain(">PR</div>");
    const none = html(photo, "meridian", { avatar: "none" });
    expect(none).not.toContain("mer-avatar");
  });
});

describe("Tracking", () => {
  it("groups the Orbit promotion under one company line", () => {
    const out = html(DOCS.full, "tracking");
    const experience = out.slice(out.indexOf(">Professional Experience<"), out.indexOf(">Projects<"));
    expect(experience.match(/Orbit Commerce/g)).toHaveLength(1);
    expect(out).toContain("Jul 2021 – Present");
  });
});

describe("pageFit", () => {
  it("counts pages and places breaks", () => {
    expect(pageFit(1123, "A4")).toMatchObject({ pages: 1, breaks: [] });
    const two = pageFit(1500, "A4");
    expect(two.pages).toBe(2);
    expect(two.breaks).toEqual([44 + 1035]);
    expect(two.text).toMatch(/^2 pages · page 2 is \d+% full/);
  });
});

describe("template sizes go through the scale variables", () => {
  const files = readdirSync(__dirname).filter((f) => f.endsWith(".css") && f !== "page.css").map((f) => join(__dirname, f));
  it.each(files)("%s", (file) => {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // Any px in a size or spacing property must be inside calc(N * var(--fs|--sp)).
    const raw = [...css.matchAll(/(?<![\w-])(font-size|margin[\w-]*|padding[\w-]*|gap|row-gap|column-gap|inline-size|block-size|min-inline-size|grid-template-columns):([^;}]+)/g)]
      .filter((m) => /(?<![\w.])\d*\.?\d+px/.test(m[2].replace(/calc\([\d.]+ \* var\(--(fs|sp)\)\)/g, "")));
    expect(raw.map((m) => m[0].trim())).toEqual([]);
  });
});

describe("CSS uses logical properties only", () => {
  const dirs = [join(__dirname), join(__dirname, ".."), join(__dirname, "../app")];
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".css")).map((f) => join(d, f)));
  it.each(files)("%s", (file) => {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/\b(left|right)\b/);
  });
});

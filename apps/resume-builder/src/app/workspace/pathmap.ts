// Translating between the three path spaces: the preview's data-path (what a
// template printed), the form's data-field (an input) and the section card
// that holds it. Ported from the design's FolioWorkspaceApp.

import type { Resume } from "../../lib/types";
import { SPECS, firstField } from "./specs";

/** The element in the preview that shows a form field. */
export function toPreview(p: string, doc?: Resume): string {
  if (p.startsWith("section:")) return p;
  if (p.startsWith("preferences.sectionTitles.")) return "section:" + p.slice(26);
  const ct = p.match(/^customSections\.(\d+)\.(title|display)$/);
  if (ct) return "section:custom:" + (doc?.customSections?.[+ct[1]]?.id ?? "");
  return p
    .replace(/\.highlights\.(\d+)\.(text|label)$/, ".highlights.$1")
    .replace(/\.(startDate|endDate)$/, ".dates")
    .replace(/^basics\.location\..*/, "basics.location")
    .replace(/^basics\.website\..*/, "basics.website")
    .replace(/^basics\.profiles\.(\d+)\..*/, "basics.profiles.$1")
    .replace(/\.location\.(city|region|country)$/, ".location")
    .replace(/\.workMode$/, ".location")
    .replace(/\.score\..*$/, ".score")
    .replace(/^(education\.\d+)\.field$/, "$1.degree")
    .replace(/^(skills\.\d+)\.name$/, "$1")
    .replace(/^basics\.photo$/, "basics.initials");
}

/** The form field to focus for a clicked preview element. */
export function toForm(p: string, doc: Resume): string {
  if (p.startsWith("section:")) {
    const k = p.slice(8);
    if (k.startsWith("custom:")) {
      const i = (doc.customSections ?? []).findIndex((c) => "custom:" + c.id === k);
      return `customSections.${i}.title`;
    }
    return p;
  }
  if (/\.highlights\.\d+$/.test(p)) return p + ".text";
  if (/\.dates$/.test(p)) return p.replace(/\.dates$/, ".startDate");
  if (p === "basics.location") return "basics.location.city";
  if (p === "basics.website") return "basics.website.url";
  if (p === "basics.initials" || p === "basics.photo") return "basics.photo";
  if (p === "basics.profiles") return "basics.profiles.0.url";
  if (/^basics\.profiles\.\d+$/.test(p)) return p + ".url";
  if (/^(work|education|volunteer|customSections\.\d+\.items)\.\d+\.location$/.test(p)) return p + ".city";
  if (/\.score$/.test(p)) return p + ".value";
  if (/^skills\.\d+$/.test(p)) return p + ".name";
  if (p === "languages" || p === "interests") return p + ".0." + (p === "languages" ? "language" : "name");
  if (p === "references") return "references.availableOnRequest";
  const m = p.match(/^(work|education|projects|certifications|awards|publications|languages|volunteer|interests)\.(\d+)$/);
  if (m) return `${p}.${firstField(SPECS[m[1]])}`;
  if (/^customSections\.\d+\.items\.\d+$/.test(p)) return p + ".title";
  if (/^references\.items\.\d+$/.test(p)) return p + ".name";
  return p;
}

/** Section card key for any path: "work", "summary", "basics", "custom:talks". */
export function sectionOf(p: string, doc: Resume): string {
  if (p.startsWith("section:")) return p.slice(8);
  if (p.startsWith("preferences.sectionTitles.")) return p.slice(26);
  const [a, b] = p.split(".");
  if (a === "basics") return b === "summary" ? "summary" : "basics";
  if (a === "customSections") return "custom:" + (doc.customSections?.[+b]?.id ?? "");
  return a;
}

/** Which item of the section the path is in (-1 for none). */
export function itemOf(p: string): number {
  const custom = p.match(/^customSections\.\d+\.items\.(\d+)/);
  if (custom) return +custom[1];
  const ref = p.match(/^references\.items\.(\d+)/);
  if (ref) return +ref[1];
  const m = p.match(/^(work|education|projects|certifications|awards|publications|languages|volunteer|interests|skills)\.(\d+)/);
  return m ? +m[2] : -1;
}

const NAMES: Record<string, string> = {
  "basics.name": "Name", "basics.headline": "Headline", "basics.email": "Email", "basics.phone": "Phone", "basics.location": "Location",
  "basics.website": "Website", "basics.summary": "Summary", "basics.initials": "Photo", "basics.photo": "Photo", "basics.profiles": "Profiles",
};
const LAST: Record<string, string> = {
  title: "Title", company: "Company", context: "Context", dates: "Dates", location: "Location", technologies: "Technologies", summary: "Description",
  institution: "School", degree: "Degree", score: "Score", name: "Name", description: "Description", url: "Link", repository: "Repository",
};
const ITEM: Record<string, string> = {
  work: "Job", education: "Education", skills: "Skill group", projects: "Project", certifications: "Certification", awards: "Award",
  publications: "Publication", languages: "Language", volunteer: "Volunteering", interests: "Interest", references: "References", customSections: "Entry",
};

/** "Edit · Bullet 2" label for the hover outline. */
export function labelFor(p: string): string {
  if (p.startsWith("section:")) return "Section heading";
  if (NAMES[p]) return NAMES[p];
  if (/^basics\.profiles\.\d+$/.test(p)) return "Profile";
  if (/^basics\.extras\.\d+$/.test(p)) return "Extra detail";
  let m;
  if ((m = p.match(/highlights\.(\d+)$/))) return `Bullet ${+m[1] + 1}`;
  if (/^skills\.\d+\.items\.\d+$/.test(p)) return "Skill";
  if (/^work\.\d+\.title$/.test(p)) return "Job title";
  const last = p.split(".").pop()!;
  if (LAST[last]) return LAST[last];
  return ITEM[p.split(".")[0]] ?? "Content";
}

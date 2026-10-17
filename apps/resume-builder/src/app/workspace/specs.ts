// What the form shows for each list section: the fields of one item, how a
// collapsed item is summarised, and a blank item for "Add". Paths are relative
// to the item ("location.city"). Every field here exists in the schema.

import { formatRange } from "../../lib/format";

export type Field =
  | { k: "text"; path: string; label: string; required?: boolean; placeholder?: string; help?: string; max?: number; type?: "email" | "url" | "tel"; half?: boolean }
  | { k: "rich"; path: string; label: string; max: number; placeholder?: string }
  | { k: "dates"; start: string; end: string; startRequired?: boolean; startLabel?: string; endLabel?: string }
  | { k: "date"; path: string; label: string; half?: boolean }
  | { k: "select"; path: string; label: string; options: [string, string][]; half?: boolean }
  | { k: "segmented"; path: string; label: string; options: [string, string][] }
  | { k: "chips"; path: string; label: string; placeholder?: string }
  | { k: "bullets"; path: string }
  | { k: "check"; path: string; label: string; help?: string };

type Item = Record<string, any>;

export interface ListSpec {
  key: string;
  noun: string;
  add: string;
  empty: string;
  /** New items go first (work is newest first). */
  newFirst?: boolean;
  /** Offer "Duplicate" (promotions). */
  duplicate?: boolean;
  blank: () => Item;
  heading: (it: Item) => string;
  sub: (it: Item) => string;
  fields: Field[];
}

const range = (it: Item) => formatRange(it.startDate, it.endDate, "MMM YYYY", "en-US");
const dot = (...xs: (string | undefined)[]) => xs.filter((x) => x && String(x).trim()).join(" · ");

const LOCATION: Field[] = [
  { k: "text", path: "location.city", label: "City", half: true },
  { k: "text", path: "location.region", label: "State / region", half: true },
];

export const FLUENCY: [string, string][] = [["", "Not set"], ["native", "Native"], ["fluent", "Fluent"], ["professional", "Professional"], ["intermediate", "Intermediate"], ["basic", "Basic"]];
const CEFR: [string, string][] = [["", "None"], ...["A1", "A2", "B1", "B2", "C1", "C2"].map((x) => [x, x] as [string, string])];

export const SPECS: Record<string, ListSpec> = {
  work: {
    key: "work", noun: "job", add: "+ Add job", newFirst: true, duplicate: true,
    empty: "No jobs yet. Start with your most recent one; internships and part-time roles count.",
    blank: () => ({ title: "", company: "", startDate: "", highlights: [{ text: "" }] }),
    heading: (it) => it.title || "New job",
    sub: (it) => dot(it.company, range(it)) || "Add the company and dates",
    fields: [
      { k: "text", path: "title", label: "Job title", required: true, half: true, max: 200 },
      { k: "text", path: "company", label: "Company", required: true, half: true, max: 200 },
      { k: "text", path: "context", label: "Context (optional)", placeholder: "Client: US Bank, or Shiksha.com", help: "The client, product or team. Printed after the company.", max: 200 },
      { k: "dates", start: "startDate", end: "endDate", startRequired: true },
      ...LOCATION,
      { k: "segmented", path: "workMode", label: "Work mode", options: [["onsite", "On-site"], ["hybrid", "Hybrid"], ["remote", "Remote"]] },
      { k: "select", path: "employmentType", label: "Employment type", options: [["", "Not shown"], ["full-time", "Full-time"], ["part-time", "Part-time"], ["contract", "Contract"], ["freelance", "Freelance"], ["internship", "Internship"], ["apprenticeship", "Apprenticeship"]] },
      { k: "rich", path: "summary", label: "One-line description (optional)", max: 1500, placeholder: "e.g. Retail-banking web portal serving 2M monthly users." },
      { k: "bullets", path: "highlights" },
      { k: "chips", path: "technologies", label: "Technologies", placeholder: "Type and press Enter" },
    ],
  },
  education: {
    key: "education", noun: "school", add: "+ Add school", empty: "Add your degree, diploma or school.",
    blank: () => ({ institution: "" }),
    heading: (it) => it.institution || "New school",
    sub: (it) => dot([it.degree, it.field].filter(Boolean).join(" in "), range(it)) || "Add the degree and dates",
    fields: [
      { k: "text", path: "institution", label: "School", required: true, max: 200 },
      { k: "text", path: "degree", label: "Degree", placeholder: "BTech, MSc, High School", half: true, max: 200 },
      { k: "text", path: "field", label: "Field of study", placeholder: "Computer Science", half: true, max: 200 },
      { k: "dates", start: "startDate", end: "endDate", endLabel: "End (or expected)" },
      ...LOCATION,
      { k: "text", path: "score.value", label: "Score", placeholder: "7.83", half: true, max: 20 },
      { k: "text", path: "score.max", label: "Out of", placeholder: "10", half: true, max: 20 },
      { k: "text", path: "score.label", label: "Score label", placeholder: "GPA, CGPA, Percentage", half: true, max: 20 },
      { k: "text", path: "honors", label: "Honours", placeholder: "Dean's list", half: true, max: 200 },
      { k: "chips", path: "courses", label: "Courses", placeholder: "Type and press Enter" },
    ],
  },
  projects: {
    key: "projects", noun: "project", add: "+ Add project", empty: "Side projects, open source, packages, hackathons.",
    blank: () => ({ name: "" }),
    heading: (it) => it.name || "New project",
    sub: (it) => dot(it.kind, range(it)) || "Add what it is and a link",
    fields: [
      { k: "text", path: "name", label: "Project name", required: true, half: true, max: 200 },
      { k: "text", path: "kind", label: "Kind", placeholder: "Open source, NPM package", half: true, max: 200 },
      { k: "text", path: "url", label: "Link", type: "url", placeholder: "https://", half: true },
      { k: "text", path: "repository", label: "Repository", type: "url", placeholder: "https://github.com/…", half: true },
      { k: "text", path: "role", label: "Your role", max: 200 },
      { k: "dates", start: "startDate", end: "endDate" },
      { k: "rich", path: "description", label: "Description", max: 1500, placeholder: "What it does and why it matters, in a sentence or two." },
      { k: "bullets", path: "highlights" },
      { k: "chips", path: "technologies", label: "Technologies", placeholder: "Type and press Enter" },
    ],
  },
  certifications: {
    key: "certifications", noun: "certification", add: "+ Add certification", empty: "Licences and certificates.",
    blank: () => ({ name: "" }),
    heading: (it) => it.name || "New certification",
    sub: (it) => dot(it.issuer, it.date) || "Add the issuer and date",
    fields: [
      { k: "text", path: "name", label: "Certification", required: true, max: 200 },
      { k: "text", path: "issuer", label: "Issuer", half: true, max: 200 },
      { k: "text", path: "credentialId", label: "Credential ID", half: true, max: 200 },
      { k: "date", path: "date", label: "Issued", half: true },
      { k: "date", path: "expires", label: "Expires", half: true },
      { k: "text", path: "url", label: "Verification link", type: "url", placeholder: "https://" },
    ],
  },
  awards: {
    key: "awards", noun: "award", add: "+ Add award", empty: "Awards and honours.",
    blank: () => ({ title: "" }),
    heading: (it) => it.title || "New award",
    sub: (it) => dot(it.awarder, it.date) || "Add who gave it and when",
    fields: [
      { k: "text", path: "title", label: "Award", required: true, max: 200 },
      { k: "text", path: "awarder", label: "Awarded by", half: true, max: 200 },
      { k: "date", path: "date", label: "Date", half: true },
      { k: "rich", path: "summary", label: "What it was for", max: 1500 },
    ],
  },
  publications: {
    key: "publications", noun: "publication", add: "+ Add publication", empty: "Papers, articles, books, posts.",
    blank: () => ({ title: "" }),
    heading: (it) => it.title || "New publication",
    sub: (it) => dot(it.venue, it.date) || "Add the venue and date",
    fields: [
      { k: "text", path: "title", label: "Title", required: true, max: 200 },
      { k: "chips", path: "authors", label: "Authors, in order", placeholder: "Type a name, press Enter" },
      { k: "text", path: "venue", label: "Venue", placeholder: "Journal, conference or blog", half: true, max: 200 },
      { k: "date", path: "date", label: "Date", half: true },
      { k: "text", path: "url", label: "Link", type: "url", placeholder: "https://", half: true },
      { k: "text", path: "doi", label: "DOI", placeholder: "10.1000/xyz123", half: true },
      { k: "rich", path: "summary", label: "Summary", max: 1500 },
    ],
  },
  languages: {
    key: "languages", noun: "language", add: "+ Add language", empty: "Spoken languages.",
    blank: () => ({ language: "" }),
    heading: (it) => it.language || "New language",
    sub: (it) => dot(FLUENCY.find((f) => f[0] === it.fluency)?.[1], it.cefr) || "Add your level",
    fields: [
      { k: "text", path: "language", label: "Language", required: true, max: 200 },
      { k: "select", path: "fluency", label: "Fluency", options: FLUENCY, half: true },
      { k: "select", path: "cefr", label: "CEFR level", options: CEFR, half: true },
    ],
  },
  volunteer: {
    key: "volunteer", noun: "role", add: "+ Add volunteering", empty: "Volunteering and community work.",
    blank: () => ({ organization: "" }),
    heading: (it) => it.role || it.organization || "New volunteering",
    sub: (it) => dot(it.role ? it.organization : "", range(it)) || "Add the organisation and dates",
    fields: [
      { k: "text", path: "organization", label: "Organisation", required: true, half: true, max: 200 },
      { k: "text", path: "role", label: "Role", half: true, max: 200 },
      { k: "dates", start: "startDate", end: "endDate" },
      { k: "rich", path: "summary", label: "Description", max: 1500 },
      { k: "bullets", path: "highlights" },
    ],
  },
  interests: {
    key: "interests", noun: "interest", add: "+ Add interest", empty: "Hobbies and interests.",
    blank: () => ({ name: "" }),
    heading: (it) => it.name || "New interest",
    sub: (it) => (it.keywords ?? []).join(", "),
    fields: [
      { k: "text", path: "name", label: "Interest", required: true, max: 200 },
      { k: "chips", path: "keywords", label: "Details", placeholder: "Type and press Enter" },
    ],
  },
  "references.items": {
    key: "references.items", noun: "referee", add: "+ Add referee", empty: "",
    blank: () => ({ name: "" }),
    heading: (it) => it.name || "New referee",
    sub: (it) => dot(it.title, it.company),
    fields: [
      { k: "text", path: "name", label: "Name", required: true, half: true, max: 200 },
      { k: "text", path: "relationship", label: "Relationship", placeholder: "Former manager at Acme", half: true, max: 200 },
      { k: "text", path: "title", label: "Title", half: true, max: 200 },
      { k: "text", path: "company", label: "Company", half: true, max: 200 },
      { k: "text", path: "email", label: "Email", type: "email", half: true },
      { k: "text", path: "phone", label: "Phone", type: "tel", half: true },
    ],
  },
  custom: {
    key: "custom", noun: "entry", add: "+ Add entry", empty: "",
    blank: () => ({ title: "" }),
    heading: (it) => it.title || "New entry",
    sub: (it) => dot(it.subtitle, range(it)),
    fields: [
      { k: "text", path: "title", label: "Title", half: true, max: 200 },
      { k: "text", path: "subtitle", label: "Subtitle", placeholder: "Where, or for whom", half: true, max: 200 },
      { k: "dates", start: "startDate", end: "endDate" },
      { k: "text", path: "url", label: "Link", type: "url", placeholder: "https://" },
      { k: "rich", path: "description", label: "Description", max: 1500 },
      { k: "bullets", path: "highlights" },
    ],
  },
};

/** The form path a click on a whole item should focus: its first field. */
export function firstField(spec: ListSpec): string {
  const f = spec.fields[0];
  return f.k === "dates" ? f.start : f.k === "bullets" ? f.path + ".0.text" : f.path;
}

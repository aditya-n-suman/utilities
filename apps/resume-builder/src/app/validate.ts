// Validation for imports and live editing. Ajv checks the document against
// schema/resume.schema.json (the single source of truth); this file turns its
// errors into one plain-language problem per field, with a fix hint and, where
// we can guess it, a one-click fix. Wording follows the design's folio-lib.js.

import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../schema/resume.schema.json";
import { DATE_RE } from "../lib/format";
import { deleteAt, getAt, toBracket } from "../lib/paths";
import type { Resume } from "../lib/types";

const ajv = new Ajv2020({ allErrors: true, strict: false, verbose: true });
addFormats(ajv);
const check = ajv.compile(schema);

export interface Problem {
  /** Dot path to the field: "work.0.startDate". */
  dot: string;
  /** Same path in bracket form for display: "work[0].startDate". */
  path: string;
  value: unknown;
  /** What's wrong, in a sentence. */
  problem: string;
  /** How to fix it. */
  hint: string;
  /** Short message shown under the form field. */
  field: string;
  /** A corrected value we're confident about, for a "Use …" button. */
  fix?: string;
  kind: "required" | "date" | "url" | "email" | "phone" | "length" | "count" | "choice" | "type" | "format" | "version" | "range";
}

export interface Unknown {
  dot: string;
  path: string;
  key: string;
  value: unknown;
  /** The known key it probably meant ("email" for "emial"). */
  suggestion?: string;
  /** Dot path of the suggested key, for "Go to email". */
  target?: string;
  /** Why it couldn't be imported. */
  reason: "unknown" | "type";
}

export interface Validation {
  errors: Problem[];
  unknown: Unknown[];
  valid: boolean;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Feb 2025", "February, 2025", "02/2025" → "2025-02". */
export function guessDate(v: unknown): string | undefined {
  const s = String(v).toLowerCase().trim();
  const named = s.match(/^([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/);
  if (named) {
    const i = MONTHS.indexOf(named[1]);
    if (i >= 0) return `${named[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  const num = s.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (num && +num[1] >= 1 && +num[1] <= 12) return `${num[2]}-${num[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})[/.](\d{1,2})$/);
  if (iso && +iso[2] >= 1 && +iso[2] <= 12) return `${iso[1]}-${iso[2].padStart(2, "0")}`;
  if (/^(current|now|today|ongoing|till date|to date)$/.test(s)) return "present";
  return undefined;
}

function lev(a: string, b: string): number {
  const m: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    m[i] = [i];
    for (let j = 1; j <= b.length; j++) m[i][j] = i ? Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) : j;
  }
  return m[a.length][b.length];
}

function closest(key: string, options: string[]): string | undefined {
  let best: string | undefined;
  let bd = Math.max(2, Math.floor(key.length / 3)) + 1;
  for (const o of options) {
    const d = lev(key.toLowerCase(), o.toLowerCase());
    if (d < bd) [best, bd] = [o, d];
  }
  return best;
}

const LABELS: Record<string, string> = {
  name: "Name", headline: "Headline", email: "Email", phone: "Phone", summary: "Summary", company: "Company", title: "Title",
  startDate: "Start date", endDate: "End date", date: "Date", expires: "Expiry date", institution: "School", degree: "Degree",
  field: "Field of study", url: "Link", repository: "Repository", language: "Language", organization: "Organisation",
  network: "Network", text: "Bullet text", label: "Bold lead-in", value: "Value", src: "Photo", id: "Section id",
  schemaVersion: "schemaVersion", basics: "Basics", items: "Items", context: "Context", role: "Role", issuer: "Issuer",
  awarder: "Awarded by", venue: "Venue", fluency: "Fluency", workMode: "Work mode", accentColor: "Accent colour",
};

export function fieldLabel(dot: string): string {
  const parts = dot.split(".");
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) return parts[parts.length - 2] === "highlights" ? `Bullet ${+last + 1}` : "Item";
  if (dot === "basics.name") return "Full name";
  if (/^work\.\d+\.title$/.test(dot)) return "Job title";
  if (/^projects\.\d+\.name$/.test(dot)) return "Project name";
  return LABELS[last] ?? last.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

const isDateKey = (dot: string) => /(^|\.)(startDate|endDate|date|expires)$/.test(dot);
const isUrlKey = (dot: string) => /(^|\.)(url|repository)$/.test(dot);
const pointerToDot = (p: string) =>
  p
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .join(".");
const join = (a: string, b: string) => (a ? `${a}.${b}` : b);
const show = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

function describe(e: ErrorObject, dot: string, value: unknown): Omit<Problem, "dot" | "path" | "value"> {
  const label = fieldLabel(dot);
  const key = dot.split(".").pop()!;
  switch (e.keyword) {
    case "required":
      return { kind: "required", problem: `${label} is missing.`, hint: `Add "${key}".`, field: `${label} is required.` };
    case "minLength":
      return value === ""
        ? { kind: "required", problem: `${label} is empty.`, hint: `Fill in "${key}".`, field: `${label} is required.` }
        : { kind: "length", problem: `${label} is too short.`, hint: "Add a little more.", field: "Too short." };
    case "maxLength": {
      const limit = (e.params as { limit: number }).limit;
      const len = String(value).length;
      return { kind: "length", problem: `${label} is too long: ${len} characters, the limit is ${limit}.`, hint: "Shorten it.", field: `${len} / ${limit} characters. Shorten it.` };
    }
    case "maxItems": {
      const limit = (e.params as { limit: number }).limit;
      return { kind: "count", problem: `Too many items: ${(value as unknown[]).length}, the limit is ${limit}.`, hint: `Keep the ${limit} strongest.`, field: `Keep at most ${limit}.` };
    }
    case "minItems":
      return { kind: "count", problem: `${label} needs at least ${(e.params as { limit: number }).limit} item.`, hint: "Add one, or remove the group.", field: "Add at least one." };
    case "enum": {
      const allowed = (e.params as { allowedValues: unknown[] }).allowedValues.map(String);
      return { kind: "choice", problem: `${show(value)} isn't one of the allowed values.`, hint: `Use one of: ${allowed.join(", ")}.`, field: `Choose one of: ${allowed.join(", ")}.` };
    }
    case "const":
      if (key === "schemaVersion") return { kind: "version", problem: 'schemaVersion must be "1.0".', hint: 'Add "schemaVersion": "1.0" at the top.', field: "", fix: "1.0" };
      return { kind: "choice", problem: `${label} must be ${show((e.params as { allowedValue: unknown }).allowedValue)}.`, hint: "", field: "" };
    case "minimum":
    case "maximum": {
      const ps = e.parentSchema as { minimum?: number; maximum?: number };
      return { kind: "range", problem: `${label} is ${show(value)}; it must be between ${ps.minimum} and ${ps.maximum}.`, hint: "Pick a value in range.", field: `Between ${ps.minimum} and ${ps.maximum}.` };
    }
    case "type":
      return { kind: "type", problem: `${label} should be ${(e.params as { type: string }).type === "array" ? "a list" : `a ${(e.params as { type: string }).type}`}, not ${Array.isArray(value) ? "a list" : typeof value}.`, hint: "Fix the shape of this value.", field: "This value has the wrong shape." };
    case "format":
      if ((e.params as { format: string }).format === "email") return { kind: "email", problem: `${show(value)} isn't an email address.`, hint: "Check for a missing @ or domain.", field: "This doesn't look like an email address." };
      return { kind: "format", problem: `${show(value)} isn't in the expected format.`, hint: "", field: "Unexpected format." };
    case "uniqueItems":
      return { kind: "format", problem: `${label} lists the same item twice.`, hint: "Remove the duplicate.", field: "Remove the duplicate." };
    default:
      break;
  }
  // pattern (and oneOf branches that reduce to one)
  if (isDateKey(dot) && typeof value === "string") {
    const g = guessDate(value);
    const end = key === "endDate";
    return {
      kind: "date",
      problem: `${show(value)} isn't a date we understand.`,
      hint: g ? `Use "${g}".` : `Use YYYY, YYYY-MM or YYYY-MM-DD${end ? ', or "present"' : ""}.`,
      field: "Couldn't read this date. Pick the month and year.",
      fix: g === "present" && !end ? undefined : g,
    };
  }
  if (isUrlKey(dot) && typeof value === "string") {
    const fix = /^[\w-]+(\.[\w-]+)+/.test(value) ? "https://" + value.replace(/^\/+/, "") : undefined;
    return { kind: "url", problem: `${show(value)} isn't a full web address.`, hint: fix ? `Use "${fix}".` : "Start it with https://.", field: "Add https:// at the start.", fix };
  }
  if (key === "phone") return { kind: "phone", problem: "The phone number has characters we can't print.", hint: "Use digits, spaces and + ( ) - . only.", field: "Use digits, spaces and + ( ) - . only." };
  if (key === "accentColor") return { kind: "format", problem: `${show(value)} isn't a colour like #1A73E8.`, hint: "Use a 6-digit hex colour.", field: "Use a colour like #1A73E8." };
  return { kind: "format", problem: `${show(value)} isn't in the expected format.`, hint: "Check the schema for this field.", field: "Unexpected format." };
}

const PRIORITY = ["required", "minLength", "pattern", "format", "maxLength", "enum", "const", "minimum", "maximum", "maxItems", "minItems", "uniqueItems", "type"];

export function validate(doc: unknown): Validation {
  const ok = check(doc);
  if (ok) return { errors: [], unknown: [], valid: true };
  const raw = (check.errors ?? []).filter((e) => !(e as { propertyName?: string }).propertyName);
  const unknown: Unknown[] = [];
  const byDot = new Map<string, ErrorObject[]>();

  for (const e of raw) {
    const at = pointerToDot(e.instancePath);
    if (e.keyword === "additionalProperties") {
      const key = (e.params as { additionalProperty: string }).additionalProperty;
      const dot = join(at, key);
      const known = Object.keys((e.parentSchema as { properties?: object }).properties ?? {});
      const suggestion = closest(key, known);
      unknown.push({ dot, path: toBracket(dot), key, value: getAt(doc, dot), suggestion, target: suggestion ? join(at, suggestion) : undefined, reason: "unknown" });
      continue;
    }
    if (e.keyword === "propertyNames") {
      const key = (e.params as { propertyName: string }).propertyName;
      const dot = join(at, key);
      unknown.push({ dot, path: toBracket(dot), key, value: getAt(doc, dot), reason: "unknown" });
      continue;
    }
    if (e.keyword === "oneOf" || e.keyword === "anyOf" || e.keyword === "if") continue;
    const dot = e.keyword === "required" ? join(at, (e.params as { missingProperty: string }).missingProperty) : at;
    byDot.set(dot, [...(byDot.get(dot) ?? []), e]);
  }

  const dots = [...byDot.keys()];
  const errors: Problem[] = [];
  for (const [dot, list] of byDot) {
    // A "wrong type" from one oneOf branch is noise when another branch says more.
    const deeper = dots.some((d) => d !== dot && d.startsWith(dot + "."));
    const useful = list.filter((e) => e.keyword !== "type" || (list.every((x) => x.keyword === "type") && !deeper));
    if (!useful.length) continue;
    useful.sort((a, b) => PRIORITY.indexOf(a.keyword) - PRIORITY.indexOf(b.keyword));
    const value = getAt(doc, dot);
    errors.push({ dot, path: toBracket(dot), value, ...describe(useful[0], dot, value) });
  }
  errors.sort((a, b) => a.dot.localeCompare(b.dot, undefined, { numeric: true }));
  return { errors, unknown, valid: false };
}


/**
 * Shape any parsed JSON into something the form can edit without crashing:
 * unknown keys and values of the wrong type are taken out (and reported),
 * everything else, including invalid values, stays where it was so the user
 * can fix it in place. Then string bullets and skills become objects.
 */
export function prepareForForm(input: unknown): { doc: Resume; dropped: Unknown[] } {
  let doc = (input && typeof input === "object" && !Array.isArray(input) ? structuredClone(input) : {}) as Record<string, unknown>;
  if (doc.schemaVersion == null) doc.schemaVersion = "1.0";
  const dropped: Unknown[] = [];
  for (let round = 0; round < 12; round++) {
    const v = validate(doc);
    const typeErrs = v.errors.filter((e) => e.kind === "type");
    if (!v.unknown.length && !typeErrs.length) break;
    for (const u of v.unknown) dropped.push(u);
    for (const t of typeErrs) dropped.push({ dot: t.dot, path: t.path, key: t.dot.split(".").pop()!, value: t.value, reason: "type" });
    for (const d of [...v.unknown.map((u) => u.dot), ...typeErrs.map((t) => t.dot)].sort().reverse()) doc = deleteAt(doc, d);
  }
  if (!doc.basics || typeof doc.basics !== "object") doc.basics = { name: "" };
  const basics = doc.basics as Record<string, unknown>;
  if (typeof basics.name !== "string") basics.name = "";
  return { doc: normalizeForForm(doc as unknown as Resume), dropped };
}

/** String bullets → {text}, string skills → {name}: one shape for the editors. Still schema-valid. */
export function normalizeForForm(input: Resume): Resume {
  const d = structuredClone(input);
  type WithHl = { highlights?: unknown[] };
  const fix = (arr?: WithHl[]) => arr?.forEach((x) => {
    if (Array.isArray(x?.highlights)) x.highlights = x.highlights.map((h) => (typeof h === "string" ? { text: h } : h));
  });
  fix(d.work as WithHl[]);
  fix(d.education as WithHl[]);
  fix(d.projects as WithHl[]);
  fix(d.volunteer as WithHl[]);
  d.customSections?.forEach((c) => fix(c.items as WithHl[]));
  d.skills?.forEach((g) => {
    if (Array.isArray(g.items)) g.items = g.items.map((s) => (typeof s === "string" ? { name: s } : s));
  });
  return d;
}

/** "3 jobs, 2 projects, 4 skill groups" for the import summary. */
export function stats(doc: Resume): string[] {
  const n = (list: unknown[] | undefined, one: string, many: string) => (list?.length ? `${list.length} ${list.length === 1 ? one : many}` : null);
  return [
    n(doc.work, "job", "jobs"),
    n(doc.projects, "project", "projects"),
    n(doc.skills, "skill group", "skill groups"),
    n(doc.education, "school", "schools"),
    n(doc.certifications, "certification", "certifications"),
  ].filter((x): x is string => !!x);
}

export interface SoftWarning {
  path: string;
  text: string;
  action: string;
}

/** Not errors: things worth a look after an import. Never block anything. */
export function softWarnings(doc: Resume): SoftWarning[] {
  const w: SoftWarning[] = [];
  const b = doc.basics ?? { name: "" };
  if (!b.email) w.push({ path: "basics.email", text: "No email address", action: "Add email" });
  if (!b.phone) w.push({ path: "basics.phone", text: "No phone number", action: "Add phone" });
  (doc.work ?? []).forEach((x, i) => {
    if (!x.highlights?.length) w.push({ path: `work.${i}.highlights`, text: `No bullets for ${x.title || "a job"}${x.company ? " at " + x.company : ""}`, action: "Add bullets" });
  });
  const sentences = (b.summary ?? "").match(/[.!?](\s|$)/g)?.length ?? 0;
  if (sentences > 5) w.push({ path: "basics.summary", text: "Summary is over 5 sentences", action: "Shorten" });
  return w;
}

/** Problem list in a form an AI can act on. */
export function problemsForAI(v: Validation, dropped: Unknown[]): string {
  const lines = [
    ...v.errors.map((e) => `- ${e.path}: ${e.problem} ${e.hint}`.trim()),
    ...[...v.unknown, ...dropped].map((u) =>
      u.reason === "type" ? `- ${u.path}: wrong type, so it was not imported.` : `- ${u.path}: unknown key${u.suggestion ? ` (did you mean "${u.suggestion}"?)` : ""}.`,
    ),
  ];
  return `Please fix these problems in the resume JSON and return the whole corrected file, nothing else:\n${lines.join("\n")}`;
}

export const isDate = (v: unknown) => typeof v === "string" && DATE_RE.test(v);

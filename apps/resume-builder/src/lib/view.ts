// Turns a resume document into what templates print: formatted dates, joined
// locations, parsed markup, ordered and filtered sections, the avatar slot.
// Templates never read the raw document. Every printed element carries a
// `path` (dot notation into the document) so click-to-edit can find its field.
// Ported from the design's folio-lib.js `view()`.

import { formatDate, formatLocation as formatLocationIn, formatRange, initialsOf, isArabic, isRtlLocale, stripUrl, contrast, tint } from "./format";
import { ICONS } from "./icons";
import { parseInline, type Seg } from "./markup";
import type { Avatar, DateFormat, Highlight, Resume } from "./types";
import { resolveTemplate, type TemplateMeta } from "../templates/registry";

export const SECTION_KEYS = [
  "summary", "work", "education", "skills", "projects", "certifications", "awards",
  "publications", "languages", "volunteer", "interests", "references",
] as const;

export const DEFAULT_TITLES: Record<string, string> = {
  summary: "Summary", work: "Experience", education: "Education", skills: "Skills", projects: "Projects",
  certifications: "Certifications", awards: "Awards", publications: "Publications", languages: "Languages",
  volunteer: "Volunteering", interests: "Interests", references: "References",
};

const MODE = { onsite: "On-site", remote: "Remote", hybrid: "Hybrid" };
const MODE_AR = { onsite: "من المكتب", remote: "عن بُعد", hybrid: "هجين" };
const FLUENCY = { native: "Native", fluent: "Fluent", professional: "Professional", intermediate: "Intermediate", basic: "Basic" };
const FLUENCY_AR = { native: "اللغة الأم", fluent: "بطلاقة", professional: "مهني", intermediate: "متوسط", basic: "أساسي" };
const NETWORK: Record<string, string> = {
  linkedin: "LinkedIn", github: "GitHub", gitlab: "GitLab", stackoverflow: "Stack Overflow", x: "X", mastodon: "Mastodon",
  bluesky: "Bluesky", medium: "Medium", devto: "DEV", behance: "Behance", dribbble: "Dribbble", kaggle: "Kaggle",
  leetcode: "LeetCode", orcid: "ORCID", googlescholar: "Google Scholar", youtube: "YouTube", npm: "npm", other: "Link",
};

export interface ViewOptions {
  template?: string;
  accent?: string;
  avatar?: Avatar;
  dateFormat?: DateFormat;
  showSkillLevels?: boolean;
  textScale?: number;
  spacingScale?: number;
}

export const TEXT_SCALE = { min: 0.85, max: 1.15 } as const;
export const SPACING_SCALE = { min: 0.5, max: 1.5 } as const;
const clampScale = (v: number | undefined, r: { min: number; max: number }) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : 1;

export interface Bullet { path: string; label?: string; segs: Seg[] }

export interface Contact {
  path: string;
  icon: string;
  /** Full text: the number, address or URL without scheme. */
  text: string;
  /** Short form for one-line contact rows: "LinkedIn", "Portfolio". */
  short: string;
  href?: string;
  /** Network name for profiles ("GitHub"). */
  name?: string;
  dir: "ltr" | "auto";
}

export interface WorkView {
  path: string;
  company: string;
  title: string;
  context?: string;
  dates: string;
  /** Location and work mode joined: "Bengaluru, Karnataka · Hybrid". */
  where?: string;
  summary?: Seg[];
  bullets: Bullet[];
  tech: string[];
}

/** Consecutive work entries at one company (a promotion history). */
export interface WorkGroup {
  path: string;
  company: string;
  context?: string;
  where?: string;
  /** Earliest start to latest end across the roles. */
  dates: string;
  roles: WorkView[];
}

export interface EducationView {
  path: string;
  institution: string;
  degreeLine?: string;
  dates?: string;
  location?: string;
  score?: { label: string; value: string; max?: string; line: string };
  honors?: string;
  courses: string[];
  bullets: Bullet[];
}

export interface SkillView { path: string; name: string; level?: number; label: string }
export interface SkillGroupView { path: string; name?: string; items: SkillView[]; joined: string }

export interface ProjectView {
  path: string;
  name: string;
  kind?: string;
  dates?: string;
  desc?: Seg[];
  bullets: Bullet[];
  tech: string[];
  link?: { text: string; href: string; path: string };
}

export interface CustomItemView {
  path: string;
  title: string;
  meta?: string;
  dates?: string;
  desc?: Seg[];
  bullets: Bullet[];
  link?: { text: string; href: string };
}

type Base = { key: string; title: string; path: string };
export type Section = Base &
  (
    | { kind: "summary"; segs: Seg[] }
    | { kind: "work"; items: WorkView[]; groups: WorkGroup[] }
    | { kind: "education"; items: EducationView[] }
    | { kind: "skills"; groups: SkillGroupView[] }
    | { kind: "projects"; items: ProjectView[] }
    | { kind: "certifications"; items: { path: string; name: string; issuer?: string; date: string; line: string }[] }
    | { kind: "awards"; items: { path: string; title: string; awarder?: string; date: string; line: string; summary?: Seg[] }[] }
    | {
        kind: "publications";
        items: { path: string; title: string; authors: { name: string; isOwner: boolean }[]; venue?: string; date: string; line: string; link?: { text: string; href: string } }[];
      }
    | { kind: "languages"; items: { path: string; language: string; level?: string }[]; joined: string }
    | { kind: "volunteer"; items: { path: string; organization: string; role?: string; dates: string; summary?: Seg[]; bullets: Bullet[] }[] }
    | { kind: "interests"; items: { path: string; name: string }[]; joined: string }
    | { kind: "references"; onRequest: boolean; text: string; items: { path: string; name: string; line: string; contact: string }[] }
    | { kind: "custom"; display: "entries" | "bullets" | "tags" | "text"; items: CustomItemView[] }
  );

export interface ResumeView {
  template: TemplateMeta;
  dir: "ltr" | "rtl";
  lang: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  /** Multipliers for text sizes and whitespace, clamped to the schema's ranges. */
  textScale: number;
  spacingScale: number;
  labels: { tech: string; online: string };
  name: string;
  headline?: string;
  initials: string;
  slot: "photo" | "initials" | "none";
  photo?: { src: string; alt: string };
  contacts: Contact[];
  profiles: Contact[];
  /** contacts followed by profiles, for single-line contact rows. */
  links: Contact[];
  extras: { path: string; label: string; value: string }[];
  showLevels: boolean;
  /** All visible sections, in order. */
  sections: Section[];
  /** Two-column templates: sections for the main and the side column. */
  main: Section[];
  side: Section[];
}

const nonEmpty = (s: string | undefined) => (s ? s : undefined);

function bullets(list: Highlight[] | undefined, base: string): Bullet[] {
  return (list ?? []).map((h, j) => {
    const o = typeof h === "string" ? { text: h } : h;
    return { path: `${base}.highlights.${j}`, label: nonEmpty(o.label), segs: parseInline(o.text) };
  });
}

const segsOrUndef = (t: string | undefined) => (t ? parseInline(t) : undefined);

export function buildView(doc: Resume, opts: ViewOptions = {}): ResumeView {
  const p = doc.preferences ?? {};
  const meta = doc.meta ?? {};
  const b = doc.basics ?? { name: "" };
  const t = resolveTemplate(opts.template ?? p.template);
  const locale = meta.locale || "en-US";
  const rtl = (meta.direction ?? (isRtlLocale(locale) ? "rtl" : "ltr")) === "rtl";
  const ar = isArabic(locale);
  const fmt = opts.dateFormat ?? p.dateFormat ?? "MMM YYYY";
  const D = (d: string | undefined) => formatDate(d, fmt, locale);
  const R = (s: string | undefined, e: string | undefined) => formatRange(s, e, fmt, locale);
  const accent = opts.accent ?? p.accentColor ?? t.accent;
  const avatar = opts.avatar ?? p.avatar ?? "auto";
  const name = b.name ?? "";
  const hasPhoto = !!b.photo?.src;
  const slot = !t.photoSlot || avatar === "none" ? "none" : avatar === "initials" || !hasPhoto ? "initials" : "photo";
  const showLevels = !!(opts.showSkillLevels ?? p.showSkillLevels) && t.levels;
  const L = ar
    ? { tech: "التقنيات", onRequest: "المراجع متاحة عند الطلب", online: "روابط", score: "المعدل", in: " في " }
    : { tech: "Tech stack", onRequest: "References available on request", online: "Find me online", score: "GPA", in: " in " };
  const modes = ar ? MODE_AR : MODE;
  const fluency = ar ? FLUENCY_AR : FLUENCY;
  const formatLocation = (l: Parameters<typeof formatLocationIn>[0]) => formatLocationIn(l, locale);

  const contacts: Contact[] = [];
  if (b.phone) contacts.push({ path: "basics.phone", icon: ICONS.phone, text: b.phone, short: b.phone, href: "tel:" + b.phone.replace(/[^+0-9]/g, ""), dir: "ltr" });
  if (b.email) contacts.push({ path: "basics.email", icon: ICONS.mail, text: b.email, short: b.email, href: "mailto:" + b.email, dir: "ltr" });
  const where = formatLocation(b.location);
  if (where) contacts.push({ path: "basics.location", icon: ICONS.pin, text: where, short: where, dir: "auto" });
  if (b.website?.url) {
    contacts.push({ path: "basics.website", icon: ICONS.globe, text: b.website.label || stripUrl(b.website.url), short: ar ? "الموقع" : "Portfolio", href: b.website.url, dir: "ltr" });
  }
  const profiles: Contact[] = (b.profiles ?? []).map((pr, i) => {
    const net = NETWORK[pr.network] ?? "Link";
    return {
      path: `basics.profiles.${i}`,
      icon: (ICONS as Record<string, string>)[pr.network] ?? ICONS.link,
      name: pr.network === "other" ? pr.label || "Link" : net,
      text: pr.label || stripUrl(pr.url),
      short: pr.network === "other" ? pr.label || "Link" : net,
      href: pr.url,
      dir: "ltr",
    };
  });

  const custom = doc.customSections ?? [];
  const all: string[] = [...SECTION_KEYS, ...custom.map((c) => "custom:" + c.id)];
  const listed = (p.sectionOrder ?? []).filter((k) => all.includes(k));
  const order = [...listed, ...all.filter((k) => !listed.includes(k))];
  const hidden = new Set(p.hiddenSections ?? []);
  const titleOf = (k: string) =>
    p.sectionTitles?.[k] ?? (k.startsWith("custom:") ? custom.find((c) => "custom:" + c.id === k)?.title ?? "Custom" : DEFAULT_TITLES[k]);

  type Body = Section extends infer S ? (S extends Section ? Omit<S, keyof Base> : never) : never;

  function build(k: string): Body | null {
    switch (k) {
      case "summary":
        return b.summary ? { kind: "summary", segs: parseInline(b.summary) } : null;
      case "work": {
        const work = doc.work ?? [];
        if (!work.length) return null;
        const items: WorkView[] = work.map((w, i) => {
          const wh = [formatLocation(w.location), w.workMode ? modes[w.workMode] : ""].filter(Boolean).join(" · ");
          return {
            path: `work.${i}`, company: w.company ?? "", title: w.title ?? "", context: nonEmpty(w.context), dates: R(w.startDate, w.endDate),
            where: nonEmpty(wh), summary: segsOrUndef(w.summary), bullets: bullets(w.highlights, `work.${i}`), tech: w.technologies ?? [],
          };
        });
        const groups: WorkGroup[] = [];
        items.forEach((it, i) => {
          const g = groups[groups.length - 1];
          if (g && g.company === it.company) {
            g.roles.push(it);
            // Newest first: the group starts when its last (oldest) role started.
            g.dates = R(work[i].startDate, work[i - g.roles.length + 1].endDate);
          } else {
            groups.push({ path: it.path, company: it.company, context: it.context, where: it.where, dates: it.dates, roles: [it] });
          }
        });
        return { kind: "work", items, groups };
      }
      case "education": {
        const ed = doc.education ?? [];
        if (!ed.length) return null;
        return {
          kind: "education",
          items: ed.map((e, i) => {
            const s = e.score;
            const label = s?.label || L.score;
            return {
              path: `education.${i}`, institution: e.institution ?? "",
              degreeLine: nonEmpty(e.degree && e.field ? e.degree + L.in + e.field : e.degree || e.field),
              dates: nonEmpty(R(e.startDate, e.endDate)), location: nonEmpty(formatLocation(e.location)),
              score: s ? { label, value: s.value, max: s.max, line: `${label}: ${s.value}${s.max ? " / " + s.max : ""}` } : undefined,
              honors: nonEmpty(e.honors), courses: e.courses ?? [], bullets: bullets(e.highlights, `education.${i}`),
            };
          }),
        };
      }
      case "skills": {
        const sk = doc.skills ?? [];
        if (!sk.length) return null;
        return {
          kind: "skills",
          groups: sk.map((g, gi) => {
            const items = (g.items ?? []).map((s, si) => {
              const o = typeof s === "string" ? { name: s, level: undefined } : s;
              const level = showLevels ? o.level : undefined;
              const nm = o.name ?? "";
              return { path: `skills.${gi}.items.${si}`, name: nm, level, label: level ? `${nm}, level ${level} of 5` : nm };
            });
            return { path: `skills.${gi}`, name: nonEmpty(g.name), items, joined: items.map((x) => x.name + (x.level ? ` (${x.level}/5)` : "")).join(", ") };
          }),
        };
      }
      case "projects": {
        const pr = doc.projects ?? [];
        if (!pr.length) return null;
        return {
          kind: "projects",
          items: pr.map((x, i) => {
            const href = x.url || x.repository;
            return {
              path: `projects.${i}`, name: x.name ?? "", kind: nonEmpty(x.kind), dates: x.startDate ? R(x.startDate, x.endDate) : undefined,
              desc: segsOrUndef(x.description), bullets: bullets(x.highlights, `projects.${i}`), tech: x.technologies ?? [],
              link: href ? { text: stripUrl(href), href, path: `projects.${i}.${x.url ? "url" : "repository"}` } : undefined,
            };
          }),
        };
      }
      case "certifications": {
        const c = doc.certifications ?? [];
        if (!c.length) return null;
        return {
          kind: "certifications",
          items: c.map((x, i) => ({ path: `certifications.${i}`, name: x.name ?? "", issuer: nonEmpty(x.issuer), date: D(x.date), line: [x.issuer, D(x.date)].filter(Boolean).join(" · ") })),
        };
      }
      case "awards": {
        const a = doc.awards ?? [];
        if (!a.length) return null;
        return {
          kind: "awards",
          items: a.map((x, i) => ({ path: `awards.${i}`, title: x.title ?? "", awarder: nonEmpty(x.awarder), date: D(x.date), line: [x.awarder, D(x.date)].filter(Boolean).join(" · "), summary: segsOrUndef(x.summary) })),
        };
      }
      case "publications": {
        const pb = doc.publications ?? [];
        if (!pb.length) return null;
        return {
          kind: "publications",
          items: pb.map((x, i) => {
            const href = x.doi ? "https://doi.org/" + x.doi : x.url;
            return {
              path: `publications.${i}`, title: x.title ?? "", authors: (x.authors ?? []).map((a) => ({ name: a, isOwner: a === name })),
              venue: nonEmpty(x.venue), date: D(x.date), line: [x.venue, D(x.date)].filter(Boolean).join(" · "),
              link: href ? { text: x.doi ? "doi.org/" + x.doi : stripUrl(x.url), href } : undefined,
            };
          }),
        };
      }
      case "languages": {
        const l = doc.languages ?? [];
        if (!l.length) return null;
        return {
          kind: "languages",
          items: l.map((x, i) => ({ path: `languages.${i}`, language: x.language ?? "", level: nonEmpty([x.fluency && fluency[x.fluency], x.cefr].filter(Boolean).join(" · ")) })),
          joined: l.map((x) => x.language + (x.fluency ? ` (${fluency[x.fluency]}${x.cefr ? ", " + x.cefr : ""})` : "")).join(" · "),
        };
      }
      case "volunteer": {
        const v = doc.volunteer ?? [];
        if (!v.length) return null;
        return {
          kind: "volunteer",
          items: v.map((x, i) => ({ path: `volunteer.${i}`, organization: x.organization ?? "", role: nonEmpty(x.role), dates: R(x.startDate, x.endDate), summary: segsOrUndef(x.summary), bullets: bullets(x.highlights, `volunteer.${i}`) })),
        };
      }
      case "interests": {
        const x = doc.interests ?? [];
        if (!x.length) return null;
        return { kind: "interests", items: x.map((y, i) => ({ path: `interests.${i}`, name: y.name ?? "" })), joined: x.map((y) => y.name).join(" · ") };
      }
      case "references": {
        const r = doc.references;
        const items = r?.items ?? [];
        if (!r || (!r.availableOnRequest && !items.length)) return null;
        return {
          kind: "references", onRequest: !!r.availableOnRequest && !items.length, text: L.onRequest,
          items: items.map((x, i) => ({ path: `references.items.${i}`, name: x.name ?? "", line: [x.title, x.company].filter(Boolean).join(", "), contact: [x.email, x.phone].filter(Boolean).join(" · ") })),
        };
      }
    }
    if (k.startsWith("custom:")) {
      const ci = custom.findIndex((c) => "custom:" + c.id === k);
      const c = custom[ci];
      if (!c?.items.length) return null;
      return {
        kind: "custom",
        display: c.display ?? "entries",
        items: c.items.map((it, j) => {
          const base = `customSections.${ci}.items.${j}`;
          return {
            path: base, title: it.title ?? "", meta: nonEmpty([it.subtitle, formatLocation(it.location)].filter(Boolean).join(" · ")),
            dates: nonEmpty(R(it.startDate, it.endDate)), desc: segsOrUndef(it.description), bullets: bullets(it.highlights, base),
            link: it.url ? { text: stripUrl(it.url), href: it.url } : undefined,
          };
        }),
      };
    }
    return null;
  }

  const sections: Section[] = [];
  for (const k of order) {
    if (hidden.has(k)) continue;
    const body = build(k);
    if (body) sections.push({ ...body, key: k, title: titleOf(k), path: "section:" + k } as Section);
  }
  const side = t.side ?? [];

  return {
    template: t,
    dir: rtl ? "rtl" : "ltr",
    lang: locale,
    accent,
    accentSoft: tint(accent, 0.88),
    onAccent: contrast(accent, "#ffffff") >= 4.5 ? "#FFFFFF" : "#111111",
    textScale: clampScale(opts.textScale ?? p.textScale, TEXT_SCALE),
    spacingScale: clampScale(opts.spacingScale ?? p.spacingScale, SPACING_SCALE),
    labels: { tech: L.tech, online: L.online },
    name,
    headline: nonEmpty(b.headline),
    initials: (b.initials || initialsOf(name)).toUpperCase(),
    slot,
    photo: hasPhoto ? { src: b.photo!.src, alt: b.photo!.alt || name } : undefined,
    contacts,
    profiles,
    links: [...contacts, ...profiles],
    extras: (b.extras ?? []).map((x, i) => ({ path: `basics.extras.${i}`, label: x.label, value: x.value })),
    showLevels,
    sections,
    main: sections.filter((s) => !side.includes(s.key)),
    side: sections.filter((s) => side.includes(s.key)),
  };
}

// Template catalogue. `soon` entries are designed in the prompt but not built yet;
// the gallery lists them, the renderer refuses them.

export interface TemplateMeta {
  id: string;
  name: string;
  ats: boolean;
  columns: 1 | 2;
  photoSlot: boolean;
  style: "Classic" | "Modern" | "Creative" | "Academic";
  accent: string;
  /** Can draw skill levels when preferences.showSkillLevels is on. */
  levels: boolean;
  fonts: string;
  /** Body text size in design px (96 per inch), to report the printed point size. */
  bodyPx?: number;
  /** Sections placed in the side column (two-column templates). */
  side?: string[];
  /** Alternative accent shown on the templates page. */
  altAccent?: string;
  soon?: boolean;
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: "meridian", name: "Meridian", ats: false, columns: 2, photoSlot: true, style: "Modern",
    accent: "#1A73E8", altAccent: "#0F766E", levels: true, fonts: "Rubik", bodyPx: 11,
    side: ["education", "skills", "projects", "languages", "certifications", "awards", "interests"],
  },
  { id: "ledger", name: "Ledger", ats: true, columns: 1, photoSlot: false, style: "Classic", accent: "#1F2A44", altAccent: "#7A1F2B", levels: false, fonts: "Source Sans 3", bodyPx: 11.7 },
  { id: "tracking", name: "Tracking", ats: true, columns: 1, photoSlot: false, style: "Classic", accent: "#2F4F6F", altAccent: "#6D28D9", levels: false, fonts: "Libre Franklin", bodyPx: 11.3 },
  { id: "harbor", name: "Harbor", ats: false, columns: 2, photoSlot: true, style: "Modern", accent: "#0F4C5C", levels: true, fonts: "", soon: true },
  { id: "editorial", name: "Editorial", ats: true, columns: 1, photoSlot: false, style: "Creative", accent: "#8A3B12", levels: false, fonts: "", soon: true },
  { id: "timeline", name: "Timeline", ats: false, columns: 1, photoSlot: true, style: "Modern", accent: "#5B4BC4", levels: false, fonts: "", soon: true },
  { id: "compact", name: "Compact", ats: true, columns: 1, photoSlot: false, style: "Classic", accent: "#1F2937", levels: false, fonts: "", soon: true },
  { id: "mono", name: "Mono", ats: true, columns: 1, photoSlot: false, style: "Modern", accent: "#0E7C3A", levels: false, fonts: "", soon: true },
  { id: "academic", name: "Academic CV", ats: true, columns: 1, photoSlot: false, style: "Academic", accent: "#283593", levels: false, fonts: "", soon: true },
  { id: "banner", name: "Banner", ats: false, columns: 2, photoSlot: true, style: "Creative", accent: "#B4421F", levels: true, fonts: "", soon: true },
];

export const READY_TEMPLATES = TEMPLATES.filter((t) => !t.soon);

export function templateTags(t: TemplateMeta): string[] {
  return [t.ats ? "ATS-safe" : "Visual", t.columns === 1 ? "One column" : "Two column", t.photoSlot ? "Photo slot" : null, t.style].filter(
    (x): x is string => !!x,
  );
}

/** A built template by id, falling back to the first one (Meridian) for unknown or unbuilt ids. */
export const resolveTemplate = (id: string | undefined): TemplateMeta =>
  READY_TEMPLATES.find((t) => t.id === id) ?? READY_TEMPLATES[0];

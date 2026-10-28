// The biodata document: content, text-size settings and photo framing. Everything here is saved to
// localStorage, so edits survive a reload in the same browser.

export type Row = [label: string, value: string];
export type SectionStyle = "edu" | "fam" | "con";

export interface Section {
  title: string;
  style: SectionStyle;
  rows: Row[];
}

/** Multipliers: heading size, body size, line spacing, gap between sections. */
export interface TypeScale {
  hs: number;
  bs: number;
  ls: number;
  sg: number;
}

/** Photo framing: zoom, and pan offset in page pixels. */
export interface PhotoFrame {
  z: number;
  x: number;
  y: number;
}

export interface Doc {
  skt1: string;
  skt2: string;
  title1: string;
  title2: string;
  personal: { title: string; rows: Row[] };
  sections: Section[];
  lppTitle: string;
  lpp: string;
  /** Data URL of the uploaded photo, or null to show the frame's built-in image. */
  photo: string | null;
  type: TypeScale;
  ph: PhotoFrame;
}

export type TextKey = "skt1" | "skt2" | "title1" | "title2" | "lppTitle" | "lpp";

// Placeholder content. Lengths roughly match the reference so line breaks land in the same places.
export const DEFAULT_DOC: Doc = {
  skt1: "|| श्री गणेशाय नमः ||",
  skt2: "|| Shree Ganeshay Namah ||",
  title1: "RAVI KUMAR SHARMA",
  title2: "BIODATA",
  personal: {
    title: "PERSONAL DETAILS",
    rows: [
      ["Date of Birth", "March 12, 1997"],
      ["Height", "175 cm"],
      ["Complexion", "Wheatish"],
      ["Religion", "Hindu"],
      ["Caste", "Your caste"],
      ["Gotra", "Your gotra"],
      ["Languages Known", "Hindi, English"],
    ],
  },
  sections: [
    {
      title: "EDUCATION & CAREER",
      style: "edu",
      rows: [
        ["Highest Education", "B.Tech (CSE), Example Institute"],
        ["12th Standard", "Example Public School, Lucknow (CBSE)"],
        ["10th Standard", "Example Vidyalaya, Lucknow (CBSE)"],
        ["Current Designation", "Software Engineer, Example Corp"],
      ],
    },
    {
      title: "FAMILY BACKGROUND",
      style: "fam",
      rows: [
        ["Father's Name", "Shri Ramesh Sharma (Teacher)"],
        ["Mother's Name", "Smt. Sunita Sharma (Homemaker)"],
        ["Elder Sister", "Ms. Priya Sharma (Doctor)"],
      ],
    },
    {
      title: "CONTACT & ADDRESS",
      style: "con",
      rows: [
        ["Contact Number", "+91 98765 43210 (Father)"],
        ["Home Address", "12 Station Road, Dist. Lucknow (Uttar Pradesh)"],
        ["Present Address", "House 4, near City Park main gate, Gomti Nagar, Lucknow (Uttar Pradesh)"],
        ["Current Residence", "Bengaluru, Karnataka"],
      ],
    },
  ],
  lppTitle: "LIFE PARTNER PREFERENCE",
  lpp:
    "A kind, grounded, and adaptable life partner is preferred - someone who values family, respects traditions, and embraces togetherness while preserving her individuality. Preference is for someone working in, or open to relocating to, a metro city. Mutual respect, trust, and companionship are valued as the foundation of a happy and fulfilling life.",
  photo: null,
  type: { hs: 1, bs: 1, ls: 1, sg: 1 },
  ph: { z: 1, x: 0, y: 0 },
};

/** Per-section metrics measured from the reference image. */
export interface SectionMetrics {
  gap: number;
  headLH: number;
  size: number;
  pitch: number;
  wrapLH: number;
  labelW: number;
  colonW: number;
  shift: number;
}

export const SECTION_METRICS: Record<SectionStyle, SectionMetrics> = {
  edu: { gap: 0, headLH: 42, size: 25.5, pitch: 36, wrapLH: 30, labelW: 253, colonW: 16, shift: -5 },
  fam: { gap: 18, headLH: 44, size: 25.5, pitch: 33, wrapLH: 30, labelW: 253, colonW: 16, shift: -5 },
  con: { gap: 18, headLH: 40, size: 23.5, pitch: 30, wrapLH: 27, labelW: 252, colonW: 15, shift: -19 },
};

export const metricsFor = (style: string): SectionMetrics =>
  SECTION_METRICS[style as SectionStyle] ?? SECTION_METRICS.fam;

export const TYPE_LIMITS: Record<keyof TypeScale, { step: number; min: number; max: number }> = {
  hs: { step: 0.02, min: 0.6, max: 1.6 },
  bs: { step: 0.02, min: 0.6, max: 1.6 },
  ls: { step: 0.02, min: 0.6, max: 1.6 },
  sg: { step: 0.1, min: 0, max: 3 },
};

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

/** One − or + press on a text-size setting. */
export function stepType(t: TypeScale, key: keyof TypeScale, dir: 1 | -1): TypeScale {
  const { step, min, max } = TYPE_LIMITS[key];
  return { ...t, [key]: round2(clamp(t[key] + dir * step, min, max)) };
}

export function zoomBy(p: PhotoFrame, dz: number): PhotoFrame {
  return { ...p, z: round2(clamp(p.z + dz, ZOOM_MIN, ZOOM_MAX)) };
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const DOC_KEY = "biodata-v1";

/** Saved document merged over the defaults, so documents saved by older versions still load. */
export function parseDoc(saved: string | null): Doc {
  if (saved) {
    try {
      const o = JSON.parse(saved) as Partial<Doc>;
      const base = clone(DEFAULT_DOC);
      return { ...base, ...o, type: { ...base.type, ...o.type }, ph: { ...base.ph, ...o.ph } };
    } catch {
      // Fall through to the defaults.
    }
  }
  return clone(DEFAULT_DOC);
}

export function loadDoc(): Doc {
  try {
    return parseDoc(localStorage.getItem(DOC_KEY));
  } catch {
    return clone(DEFAULT_DOC);
  }
}

/** Saves the document. If the photo makes it too large for storage, saves everything but the photo. */
export function saveDoc(d: Doc): void {
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify(d));
  } catch {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify({ ...d, photo: null }));
    } catch {
      // Storage unavailable (private window, blocked site data): edits last until reload.
    }
  }
}

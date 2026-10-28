// Look-and-feel settings (the Claude Design "Tweaks" panel). Saved apart from the document, so
// "Reset to original" keeps the chosen font and colours.

export const FONTS = {
  "Noto Serif": "'Noto Serif', serif",
  "PT Serif": "'PT Serif', serif",
} as const;
export type FontName = keyof typeof FONTS;

export const HEADING_COLORS = ["#2b0b0a", "#4a1208", "#1f1b17", "#6b2a10"];
export const TEXT_COLORS = ["#1f1b17", "#2b0b0a", "#3a2a20"];

export interface Settings {
  editing: boolean;
  font: FontName;
  headColor: string;
  textColor: string;
}

export const DEFAULT_SETTINGS: Settings = {
  editing: true,
  font: "Noto Serif",
  headColor: "#2b0b0a",
  textColor: "#1f1b17",
};

const KEY = "biodata-settings-v1";

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    const merged = { ...DEFAULT_SETTINGS, ...s };
    if (!(merged.font in FONTS)) merged.font = DEFAULT_SETTINGS.font;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not persisted; fine for the session.
  }
}

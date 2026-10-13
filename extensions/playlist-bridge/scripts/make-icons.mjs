// Renders the toolbar icons from the Claude Design spec (design/Playlist Bridge Extension.dc.html, ICON_SETS).
// Usage: node scripts/make-icons.mjs  → public/icons/{16,32,48,128}.png and dark-*.png
import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

// OKLCH → sRGB hex (resvg doesn't understand oklch()).
function oklchToHex(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const enc = (x) => {
    const v = Math.min(1, Math.max(0, x));
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${lin.map(enc).join("")}`;
}

const PALETTE = {
  light: { green: oklchToHex(0.6, 0.17, 152), red: oklchToHex(0.58, 0.21, 27) },
  dark: { green: oklchToHex(0.76, 0.17, 152), red: oklchToHex(0.68, 0.2, 27) },
};

function svg(size, { green, red }) {
  const g = size <= 32
    ? { vb: "0 0 16 16", c1: 4, c2: 12, cy: 8, r: 3.6, bx: 4, by: 6.5, bw: 8, bh: 3, brx: 1.5 }
    : { vb: "0 0 128 128", c1: 28, c2: 100, cy: 64, r: 20, bx: 28, by: 60, bw: 72, bh: 8, brx: 4 };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${g.vb}">
  <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${green}"/><stop offset="1" stop-color="${red}"/></linearGradient></defs>
  <rect x="${g.bx}" y="${g.by}" width="${g.bw}" height="${g.bh}" rx="${g.brx}" fill="url(#g)"/>
  <circle cx="${g.c1}" cy="${g.cy}" r="${g.r}" fill="${green}"/>
  <circle cx="${g.c2}" cy="${g.cy}" r="${g.r}" fill="${red}"/>
</svg>`;
}

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  for (const [variant, prefix] of [["light", ""], ["dark", "dark-"]]) {
    const png = new Resvg(svg(size, PALETTE[variant]), { fitTo: { mode: "width", value: size } }).render().asPng();
    writeFileSync(new URL(`${prefix}${size}.png`, out), png);
  }
}
writeFileSync(new URL("icon.svg", out), svg(128, PALETTE.light));
console.log("icons written", PALETTE);

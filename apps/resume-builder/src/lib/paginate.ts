// How many printed pages a rendered resume will take, measured from the live
// DOM. Print moves any block marked break-inside: avoid (a job, a project, a
// skill group) to the next page whole, and keeps a heading with what follows
// it, so a plain "height ÷ page height" undercounts. This simulates that per
// column ([data-flow] containers flow independently, as print does).

import { PAGE } from "../templates/ResumePage";
import type { PageSize } from "./types";

export interface PageCount {
  pages: number;
  /** How full the last page is, 0–1. */
  lastFill: number;
  /** Content-area offsets (sheet px) where pages break, for guide lines. */
  breaks: number[];
}

const avoids = (el: Element) => {
  const v = getComputedStyle(el).breakInside;
  return v === "avoid" || v === "avoid-page";
};

export function countPages(page: HTMLElement, size: PageSize): PageCount {
  const perPage = PAGE[size].height - 2 * PAGE.marginBlock;
  const pr = page.getBoundingClientRect();
  const k = pr.width / page.offsetWidth || 1; // the sheet may be shown scaled
  const y = (v: number) => (v - pr.top) / k - PAGE.marginBlock;

  const tpl = page.firstElementChild as HTMLElement | null;
  if (!tpl) return { pages: 1, lastFill: 0, breaks: [] };

  // Leaf-most unbreakable blocks, each with the heading glued to it when it's
  // the first block after that heading.
  const all = [...tpl.querySelectorAll<HTMLElement>("*")].filter(avoids);
  const leaves = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
  const flows = new Map<Element, { top: number; bottom: number }[]>();
  for (const el of leaves) {
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    let top = y(r.top);
    const section = el.closest("section");
    const h = section?.querySelector(":scope > h2");
    if (h && section && [...section.querySelectorAll<HTMLElement>("*")].find((x) => leaves.includes(x)) === el) top = y(h.getBoundingClientRect().top);
    const flow = el.closest("[data-flow]") ?? tpl;
    const list = flows.get(flow) ?? [];
    list.push({ top, bottom: y(r.bottom) });
    flows.set(flow, list);
  }

  const tplBottom = y(tpl.getBoundingClientRect().bottom);
  let end = tplBottom;
  for (const [flow, blocks] of flows) {
    blocks.sort((a, b) => a.top - b.top);
    let shift = 0;
    for (const b of blocks) {
      const t = b.top + shift;
      const h = b.bottom - b.top;
      const pageEnd = (Math.floor(t / perPage + 1e-6) + 1) * perPage;
      if (t + h > pageEnd + 0.5 && h <= perPage && t > pageEnd - perPage + 0.5) shift += pageEnd - t;
    }
    const flowBottom = flow === tpl ? tplBottom : y(flow.getBoundingClientRect().bottom);
    end = Math.max(end, flowBottom + shift);
  }

  const pages = Math.max(1, Math.ceil(end / perPage - 1e-3));
  const lastFill = Math.min(1, Math.max(0, (end - perPage * (pages - 1)) / perPage));
  const breaks = Array.from({ length: pages - 1 }, (_, i) => PAGE.marginBlock + perPage * (i + 1));
  return { pages, lastFill, breaks };
}

export interface Scales {
  textScale: number;
  spacingScale: number;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * The largest text size, then the largest spacing, that brings the resume
 * down to `target` pages. Spacing goes first (down to 50%), text second (down
 * to 85%). Measures by setting the scale variables on the live sheet and
 * restoring them, so nothing repaints in between. Null when even the smallest
 * settings don't fit.
 */
export function findFit(page: HTMLElement, size: PageSize, target: number, from: Scales, limits = { text: 0.85, spacing: 0.5 }): Scales | null {
  const saved = [page.style.getPropertyValue("--text-scale"), page.style.getPropertyValue("--space-scale")];
  try {
    for (let t = round(from.textScale); t >= limits.text - 1e-9; t = round(t - 0.05)) {
      page.style.setProperty("--text-scale", String(t));
      for (let s = round(from.spacingScale); s >= limits.spacing - 1e-9; s = round(s - 0.05)) {
        page.style.setProperty("--space-scale", String(s));
        if (countPages(page, size).pages <= target) return { textScale: t, spacingScale: s };
      }
    }
    return null;
  } finally {
    page.style.setProperty("--text-scale", saved[0]);
    page.style.setProperty("--space-scale", saved[1]);
  }
}

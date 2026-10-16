// "Templates 1–3 · from your references": every built template rendered from
// the fixtures, with page-break guides, a page count and Save as PDF.
// Implements design/Folio Templates.dc.html.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import full from "../../schema/examples/full.json";
import minimal from "../../schema/examples/minimal.json";
import rtl from "../../schema/examples/rtl.json";
import { printResume } from "../lib/print";
import type { Avatar, PageSize, Resume } from "../lib/types";
import { buildView, type ViewOptions } from "../lib/view";
import { READY_TEMPLATES, TEMPLATES, templateTags } from "../templates/registry";
import { PAGE, ResumePage } from "../templates/ResumePage";

export const FIXTURES = {
  full: full as unknown as Resume,
  minimal: minimal as unknown as Resume,
  rtl: rtl as unknown as Resume,
};

const PLACEHOLDER_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#CFCFC9"/><circle cx="100" cy="80" r="36" fill="#A9A9A2"/><path d="M30 200a70 70 0 0 1 140 0z" fill="#A9A9A2"/></svg>',
  );

interface Render {
  key: string;
  label: string;
  doc: Resume;
  opts: ViewOptions;
}

function rendersFor(id: string): Render[] {
  const t = TEMPLATES.find((x) => x.id === id)!;
  const list: Render[] = [
    { key: `${id}-full`, label: `full.json · default accent ${t.accent}`, doc: FIXTURES.full, opts: { template: id, accent: t.accent } },
    { key: `${id}-min`, label: `minimal.json · alt accent ${t.altAccent}`, doc: FIXTURES.minimal, opts: { template: id, accent: t.altAccent } },
  ];
  if (id === "ledger") list.push({ key: `${id}-rtl`, label: "rtl.json · right to left", doc: FIXTURES.rtl, opts: { template: id } });
  return list;
}

export function TemplatesPage() {
  const [size, setSize] = useState<PageSize>("A4");
  const withPhoto = useMemo<Resume>(() => ({ ...FIXTURES.full, basics: { ...FIXTURES.full.basics, photo: { src: PLACEHOLDER_PHOTO, alt: "Photo placeholder" } } }), []);
  const heads: { label: string; doc: Resume; avatar: Avatar }[] = [
    { label: "Photo", doc: withPhoto, avatar: "auto" },
    { label: "Initials", doc: FIXTURES.full, avatar: "initials" },
    { label: "None · header reflows", doc: FIXTURES.full, avatar: "none" },
  ];

  return (
    <main className="tp">
      <header className="tp-top">
        <div>
          <div className="tp-brand">Folio</div>
          <h1 className="tp-title">Templates 1–3 · from your references</h1>
          <p className="tp-lede">
            {size} pages rendered from <code>full.json</code>, then <code>minimal.json</code> in an alternative accent. Dashed lines mark where pages
            break. <strong>Save as PDF</strong> opens the print dialog; choose “Save as PDF” as the destination.
          </p>
        </div>
        <fieldset className="tp-size">
          <legend>Page size</legend>
          {(["A4", "Letter"] as const).map((s) => (
            <label key={s}>
              <input type="radio" name="size" checked={size === s} onChange={() => setSize(s)} /> {s}
            </label>
          ))}
        </fieldset>
      </header>

      {READY_TEMPLATES.map((t) => (
        <section key={t.id} className="tp-row" aria-labelledby={`tp-${t.id}`}>
          <div className="tp-row-head">
            <h2 className="tp-row-title" id={`tp-${t.id}`}>{t.name}</h2>
            <span className="tp-tags">
              {templateTags(t).join(" · ")} · {t.fonts}
            </span>
          </div>
          <div className="tp-renders">
            {rendersFor(t.id).map((r) => (
              <RenderCard key={r.key} r={r} size={size} />
            ))}
          </div>
        </section>
      ))}

      <section className="tp-row" aria-labelledby="tp-avatar">
        <div className="tp-row-head">
          <h2 className="tp-row-title" id="tp-avatar">Meridian header · three avatar modes</h2>
        </div>
        <div className="tp-renders">
          {heads.map((h) => (
            <figure key={h.label} className="tp-card">
              <figcaption className="tp-label">{h.label}</figcaption>
              <Scaled scale={0.6} width={PAGE[size].width} height={250}>
                <ResumePage vm={buildView(h.doc, { template: "meridian", avatar: h.avatar })} size={size} className="tp-clip" />
              </Scaled>
            </figure>
          ))}
        </div>
        <p className="tp-note">The photo here is a grey placeholder. In the workspace it comes from Basics → Upload photo.</p>
      </section>

      <section className="tp-row">
        <div className="tp-row-head">
          <h2 className="tp-row-title">Coming next</h2>
        </div>
        <p className="tp-note">{TEMPLATES.filter((t) => t.soon).map((t) => t.name).join(" · ")}</p>
      </section>
    </main>
  );
}

function RenderCard({ r, size }: { r: Render; size: PageSize }) {
  const vm = useMemo(() => buildView(r.doc, r.opts), [r]);
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(PAGE[size].height);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [size]);

  const fit = pageFit(height, size);
  return (
    <figure className="tp-card">
      <figcaption className="tp-label">{r.label}</figcaption>
      <Scaled scale={0.5} width={PAGE[size].width} height={Math.max(height, PAGE[size].height)}>
        <div ref={ref} className="tp-sheet">
          <ResumePage vm={vm} size={size} />
          {fit.breaks.map((y, i) => (
            <div key={i} className="tp-break" style={{ insetBlockStart: y }} aria-hidden="true">
              <span>page {i + 2}</span>
            </div>
          ))}
        </div>
      </Scaled>
      <div className="tp-foot">
        <span className="tp-count">{fit.text}</span>
        <button type="button" className="tp-btn" onClick={() => printResume(r.doc, r.opts, size)}>
          Save as PDF
        </button>
      </div>
    </figure>
  );
}

/**
 * Estimated pagination of a continuous sheet. Each printed page holds the
 * page height minus its top and bottom margins; break-inside: avoid can push
 * an entry to the next page, so print may break slightly earlier.
 */
export function pageFit(sheetHeight: number, size: PageSize) {
  const perPage = PAGE[size].height - 2 * PAGE.marginBlock;
  const content = Math.max(0, sheetHeight - 2 * PAGE.marginBlock);
  const pages = Math.max(1, Math.ceil(content / perPage - 0.002));
  const breaks = Array.from({ length: pages - 1 }, (_, i) => PAGE.marginBlock + perPage * (i + 1));
  const lastFill = pages === 1 ? content / perPage : (content - perPage * (pages - 1)) / perPage;
  const pct = Math.round(lastFill * 100);
  const text =
    pages === 1 ? "One page" : `${pages} pages · page ${pages} is ${pct}% full${pct < 25 ? ": trim a little to fit on " + (pages - 1) : ""}`;
  return { pages, breaks, lastFill, text };
}

/** Shows a page at a scale while keeping layout size honest, so the grid around it doesn't overlap. */
function Scaled({ scale, width, height, children }: { scale: number; width: number; height: number; children: ReactNode }) {
  return (
    <div className="tp-scaled" style={{ inlineSize: width * scale, blockSize: height * scale }}>
      <div className="tp-scaled-inner" style={{ inlineSize: width, marginInline: (width * scale - width) / 2, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

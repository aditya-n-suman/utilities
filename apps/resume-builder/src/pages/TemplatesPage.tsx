// "Templates 1–3 · from your references": every built template rendered from
// the fixtures, with page-break guides, a page count and Save as PDF.
// Implements design/Folio Templates.dc.html.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import full from "../../schema/examples/full.json";
import minimal from "../../schema/examples/minimal.json";
import rtl from "../../schema/examples/rtl.json";
import { printResume } from "../lib/print";
import type { Avatar, PageSize, Resume } from "../lib/types";
import { buildView, SPACING_SCALE, TEXT_SCALE, type ViewOptions } from "../lib/view";
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

interface Scales {
  textScale: number;
  spacingScale: number;
}

export function TemplatesPage() {
  const [size, setSize] = useState<PageSize>("A4");
  const [scales, setScales] = useState<Scales>({ textScale: 1, spacingScale: 1 });
  const mainRef = useRef<HTMLElement>(null);
  const avail = useContentWidth(mainRef);
  // Half size like the design, smaller when the screen can't fit that.
  const fitTo = (want: number) => Math.min(want, avail / PAGE[size].width);
  const withPhoto = useMemo<Resume>(() => ({ ...FIXTURES.full, basics: { ...FIXTURES.full.basics, photo: { src: PLACEHOLDER_PHOTO, alt: "Photo placeholder" } } }), []);
  const heads: { label: string; doc: Resume; avatar: Avatar }[] = [
    { label: "Photo", doc: withPhoto, avatar: "auto" },
    { label: "Initials", doc: FIXTURES.full, avatar: "initials" },
    { label: "None · header reflows", doc: FIXTURES.full, avatar: "none" },
  ];

  return (
    <main className="tp" ref={mainRef}>
      <header className="tp-top">
        <div>
          <div className="tp-brand">Folio</div>
          <h1 className="tp-title">Templates 1–3 · from your references</h1>
          <p className="tp-lede">
            {size} pages rendered from <code>full.json</code>, then <code>minimal.json</code> in an alternative accent. Dashed lines mark where pages
            break. <strong>Save as PDF</strong> opens the print dialog; choose “Save as PDF” as the destination.
          </p>
        </div>
        <div className="tp-controls">
          <fieldset className="tp-size">
            <legend>Page size</legend>
            {(["A4", "Letter"] as const).map((s) => (
              <label key={s}>
                <input type="radio" name="size" checked={size === s} onChange={() => setSize(s)} /> {s}
              </label>
            ))}
          </fieldset>
          <ScaleControls value={scales} onChange={setScales} />
        </div>
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
              <RenderCard key={r.key} r={r} size={size} scales={scales} scale={fitTo(0.5)} />
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
              <Scaled scale={fitTo(0.6)} width={PAGE[size].width} height={250}>
                <ResumePage vm={buildView(h.doc, { template: "meridian", avatar: h.avatar, ...scales })} size={size} className="tp-clip" />
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

const pct = (v: number) => Math.round(v * 100) + "%";

/** Text size and spacing sliders, in 5% steps. Both go into preferences in the workspace. */
function ScaleControls({ value, onChange }: { value: Scales; onChange: (v: Scales) => void }) {
  const row = (key: keyof Scales, label: string, range: { min: number; max: number }) => (
    <label className="tp-scale">
      <span className="tp-scale-label">{label}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={0.05}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: +e.target.value })}
      />
      <output>{pct(value[key])}</output>
    </label>
  );
  const changed = value.textScale !== 1 || value.spacingScale !== 1;
  return (
    <fieldset className="tp-size tp-scales">
      <legend>Fit</legend>
      {row("textScale", "Text size", TEXT_SCALE)}
      {row("spacingScale", "Spacing", SPACING_SCALE)}
      <button type="button" className="tp-link" disabled={!changed} onClick={() => onChange({ textScale: 1, spacingScale: 1 })}>
        Reset
      </button>
    </fieldset>
  );
}

function RenderCard({ r, size, scales, scale }: { r: Render; size: PageSize; scales: Scales; scale: number }) {
  const opts = useMemo(() => ({ ...r.opts, ...scales }), [r, scales]);
  const vm = useMemo(() => buildView(r.doc, opts), [r, opts]);
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
      <Scaled scale={scale} width={PAGE[size].width} height={Math.max(height, PAGE[size].height)}>
        <div ref={ref} className="tp-sheet">
          <ResumePage vm={vm} size={size} />
          {fit.breaks.map((y, i) => (
            <div key={i} className="tp-break" style={{ insetBlockStart: y }} aria-hidden="true">
              <span>page {i + 2}</span>
            </div>
          ))}
        </div>
      </Scaled>
      <div className="tp-foot" style={{ maxInlineSize: PAGE[size].width * scale }}>
        <span className="tp-count">
          {fit.text}
          {vm.template.bodyPx && <> · body text {bodyPt(vm.template.bodyPx, vm.textScale)} pt</>}
        </span>
        <button type="button" className="tp-btn" onClick={() => printResume(r.doc, opts, size)}>
          Save as PDF
        </button>
      </div>
    </figure>
  );
}

/** Width of an element's content box, kept up to date. */
function useContentWidth(ref: RefObject<HTMLElement>) {
  const [w, setW] = useState(Infinity);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Printed size of the body text: 96 CSS px per inch, 72 pt per inch. */
export const bodyPt = (px: number, scale: number) => (Math.round(px * scale * 0.75 * 10) / 10).toFixed(1);

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

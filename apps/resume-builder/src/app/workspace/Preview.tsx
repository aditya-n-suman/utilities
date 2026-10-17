// The live page. Hovering outlines the part under the pointer with "Edit ·
// <field>", clicking it jumps to that field in the form, the focused form
// field is highlighted here, and fields with problems get a red marker. All
// of it works off the templates' data-path attributes.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { countPages, type PageCount } from "../../lib/paginate";
import type { PageSize, Resume } from "../../lib/types";
import type { ResumeView } from "../../lib/view";
import { PAGE, ResumePage } from "../../templates/ResumePage";
import type { Problem } from "../validate";
import { labelFor, toPreview } from "./pathmap";

interface Box { x: number; y: number; w: number; h: number }

export interface PreviewProps {
  doc: Resume;
  vm: ResumeView;
  size: PageSize;
  active: string | null;
  errors: Problem[];
  /** Largest scale to show the page at (1 = actual size). */
  maxScale: number;
  sheetRef: RefObject<HTMLDivElement>;
  onPick: (path: string) => void;
  onPages: (p: PageCount) => void;
  big?: boolean;
}

const esc = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));

export function Preview({ doc, vm, size, active, errors, maxScale, sheetRef, onPick, onPages, big }: PreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState<number>(PAGE[size].height);
  const [hover, setHover] = useState<(Box & { path: string; label: string }) | null>(null);
  const [act, setAct] = useState<Box | null>(null);
  const [errBoxes, setErrBoxes] = useState<Box[]>([]);
  const [pages, setPages] = useState<PageCount>({ pages: 1, lastFill: 0, breaks: [] });
  const pw = PAGE[size].width;
  const scale = width ? Math.min(maxScale, width / pw) : maxScale;
  const empty = !vm.name.trim() && !vm.sections.length;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const findEl = (p: string | null): HTMLElement | null => {
    const sheet = sheetRef.current;
    if (!sheet || !p) return null;
    let q = toPreview(p, doc);
    while (q) {
      const el = sheet.querySelector<HTMLElement>(`[data-path="${esc(q)}"]`);
      if (el) return el;
      const i = q.lastIndexOf(".");
      if (i < 0) break;
      q = q.slice(0, i);
    }
    return null;
  };
  const rel = (el: Element): Box => {
    const h = hostRef.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height };
  };

  // Measure after every render that can move things: page count, the active
  // field's box and the error markers.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !hostRef.current) return;
    const measure = () => {
      setHeight(sheet.offsetHeight);
      const pageEl = sheet.querySelector<HTMLElement>(".folio-page");
      const pc = pageEl && !pageEl.classList.contains("pv-empty") ? countPages(pageEl, size) : { pages: 1, lastFill: 0, breaks: [] };
      setPages((old) => (old.pages === pc.pages && Math.abs(old.lastFill - pc.lastFill) < 0.005 ? old : pc));
      const a = findEl(active);
      setAct(a ? rel(a) : null);
      const boxes: Box[] = [];
      for (const e of errors) {
        const el = findEl(e.dot);
        if (el) boxes.push(rel(el));
      }
      setErrBoxes((old) => (JSON.stringify(old) === JSON.stringify(boxes) ? old : boxes));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm, active, errors, scale, size]);

  useLayoutEffect(() => onPages(pages), [pages, onPages]);

  // Scroll the highlighted element into view when a form field gains focus.
  useLayoutEffect(() => {
    const el = findEl(active);
    const pane = wrapRef.current?.closest(".pv-pane");
    if (!el || !pane) return;
    const pr = pane.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < pr.top + 40 || er.bottom > pr.bottom - 40) pane.scrollTo({ top: pane.scrollTop + er.top - pr.top - pr.height / 3, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const target = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.("[data-path]");
    return el && sheetRef.current?.contains(el) ? (el as HTMLElement) : null;
  };

  return (
    <div ref={wrapRef} className="pv-fit">
      <div
        ref={hostRef}
        className={"pv-host" + (big ? " big" : "")}
        style={{ inlineSize: pw * scale, blockSize: Math.max(height, PAGE[size].height) * scale }}
        onMouseMove={(e) => {
          if (empty) return;
          const el = target(e);
          if (!el) return setHover(null);
          const p = el.dataset.path!;
          if (hover?.path !== p) setHover({ path: p, label: labelFor(p), ...rel(el) });
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const el = target(e);
          if (el) onPick(el.dataset.path!);
        }}
      >
        <div className="pv-scale" style={{ inlineSize: pw, transform: `scale(${scale})` }}>
          <div ref={sheetRef} className="pv-sheet">
            {empty ? (
              <div className="folio-page pv-empty" style={{ ["--page-width" as string]: pw + "px", ["--page-height" as string]: PAGE[size].height + "px", ["--page-margin-block" as string]: "44px", ["--page-margin-inline" as string]: "48px" }}>
                <div>
                  <div className="pv-empty-title">Your resume appears here as you type</div>
                  Start with your name in Basics.
                </div>
              </div>
            ) : (
              <ResumePage vm={vm} size={size} />
            )}
          </div>
        </div>
        {!empty &&
          pages.breaks.map((y, i) => (
            <div key={i} className="pv-break" style={{ insetBlockStart: y * scale }} aria-hidden="true">
              <span>Page {i + 2}</span>
            </div>
          ))}
        {errBoxes.map((b, i) => (
          <div key={i} className="ov ov-err" style={{ insetInlineStart: b.x, insetBlockStart: b.y, inlineSize: b.w, blockSize: b.h }} aria-hidden="true">
            <span>!</span>
          </div>
        ))}
        {act && <div className="ov ov-act" style={{ insetInlineStart: act.x, insetBlockStart: act.y, inlineSize: act.w, blockSize: act.h }} aria-hidden="true" />}
        {hover && (
          <div className="ov ov-hover" style={{ insetInlineStart: hover.x, insetBlockStart: hover.y, inlineSize: hover.w, blockSize: hover.h }} aria-hidden="true">
            <span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
              Edit · {hover.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

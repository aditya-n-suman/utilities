// Template gallery: every built template rendered with the user's own
// content. Used after an import ("Choose a template") and from the Design tab.

import { useEffect, useMemo, useRef } from "react";
import type { Resume } from "../../lib/types";
import { buildView } from "../../lib/view";
import { READY_TEMPLATES, TEMPLATES, templateTags } from "../../templates/registry";
import { PAGE, ResumePage } from "../../templates/ResumePage";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export function TemplateCards({ doc, current, onPick, scale = 0.3 }: { doc: Resume; current: string; onPick: (id: string) => void; scale?: number }) {
  const size = doc.preferences?.pageSize ?? "A4";
  // Show each template exactly as picking it would: the document keeps its own accent if it has one.
  const views = useMemo(() => READY_TEMPLATES.map((t) => buildView(doc, { template: t.id })), [doc]);
  return (
    <div className="gallery-grid">
      {READY_TEMPLATES.map((t, i) => (
        <button key={t.id} type="button" className={cx("tcard", t.id === current && "on")} aria-pressed={t.id === current} onClick={() => onPick(t.id)}>
          <span className="tcard-page" style={{ inlineSize: PAGE[size].width * scale, blockSize: PAGE[size].height * scale }} aria-hidden="true">
            <span className="tcard-inner" style={{ inlineSize: PAGE[size].width, transform: `scale(${scale})` }}>
              <ResumePage vm={views[i]} size={size} />
            </span>
          </span>
          <span className="tcard-name">
            {t.name}
            {t.id === current && <span className="tcard-check">Selected</span>}
          </span>
          <span className="tcard-tags">{templateTags(t).join(" · ")}</span>
        </button>
      ))}
    </div>
  );
}

export function Gallery({ doc, current, onPick, onClose }: { doc: Resume; current: string; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [onClose]);
  const soon = TEMPLATES.filter((t) => t.soon);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="gallery-title" tabIndex={-1} className="dialog dialog-wide">
        <div className="dialog-head">
          <div>
            <h2 id="gallery-title" className="dialog-title">Templates</h2>
            <div className="f-help">Rendered with your content. Pick one; you can switch any time.</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <TemplateCards doc={doc} current={current} onPick={(id) => { onPick(id); onClose(); }} />
        <div className="f-help soon">Coming next: {soon.map((t) => t.name).join(" · ")}</div>
      </div>
    </div>
  );
}

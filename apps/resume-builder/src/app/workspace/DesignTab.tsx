// The Design tab: template, accent, page size, date format, photo slot, skill
// levels, and the fit controls (text size, spacing, "Fit on N pages"). Every
// control writes preferences, so the choices travel with the JSON.

import { contrast } from "../../lib/format";
import { setAt } from "../../lib/paths";
import type { PageCount } from "../../lib/paginate";
import type { ResumeView } from "../../lib/view";
import { SPACING_SCALE, TEXT_SCALE } from "../../lib/view";
import { READY_TEMPLATES, templateTags } from "../../templates/registry";
import { ResumePage } from "../../templates/ResumePage";
import { useWs } from "./context";
import { Segmented, SelectInput } from "./fields";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
const pct = (v: number) => Math.round(v * 100) + "%";
export const bodyPt = (px: number, scale: number) => (Math.round(px * scale * 0.75 * 10) / 10).toFixed(1);

export interface DesignProps {
  vm: ResumeView;
  pages: PageCount;
  onBrowse: () => void;
  onFit: (target: number) => void;
  onFocusPreview: () => void;
}

export function DesignTab({ vm, pages, onBrowse, onFit, onFocusPreview }: DesignProps) {
  const ws = useWs();
  const p = ws.doc.preferences ?? {};
  const t = vm.template;
  const accent = vm.accent.toUpperCase();
  const presets = [...new Set([t.accent, "#1A73E8", "#0F766E", "#B42318", "#6D28D9", "#1F2937"].map((c) => c.toUpperCase()))].slice(0, 6);
  const ratio = contrast(vm.accent, "#ffffff");
  const setPref = (k: string, v: unknown) => ws.set(`preferences.${k}`, v);
  const setScale = (k: "textScale" | "spacingScale", v: number) => setPref(k, Math.abs(v - 1) < 1e-6 ? undefined : v);
  const sizeName = (p.pageSize ?? "A4") === "Letter" ? "Letter" : "A4";
  const fitOk = pages.pages === 1;
  const sparse = pages.pages > 1 && pages.lastFill < 0.3;
  const atFloor = vm.textScale <= TEXT_SCALE.min + 1e-6 && vm.spacingScale <= SPACING_SCALE.min + 1e-6;

  return (
    <div className="design">
      <section className="d-card d-template">
        <div className="d-thumb" aria-hidden="true">
          <div className="d-thumb-inner"><ResumePage vm={vm} size={p.pageSize ?? "A4"} /></div>
        </div>
        <div className="d-template-info">
          <div className="d-eyebrow">Template</div>
          <div className="d-template-name">{t.name}</div>
          <div className="tags">{templateTags(t).map((x) => <span key={x} className="tag">{x}</span>)}</div>
          <button type="button" className="btn" onClick={onBrowse}>Browse all templates</button>
          <div className="row-gap">
            {READY_TEMPLATES.map((x) => (
              <button key={x.id} type="button" className={cx("btn btn-xs", x.id === t.id && "on")} aria-pressed={x.id === t.id} onClick={() => setPref("template", x.id)}>{x.name}</button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="d-title">Accent colour</div>
        <div className="row-gap align-center">
          {presets.map((c) => (
            <button key={c} type="button" className={cx("swatch", c === accent && "on")} style={{ background: c }} aria-label={`Accent ${c}`} aria-pressed={c === accent} onClick={() => setPref("accentColor", c === t.accent.toUpperCase() ? undefined : c)} />
          ))}
          <label className="btn btn-sm color-pick">
            Custom
            <input type="color" value={vm.accent} onChange={(e) => setPref("accentColor", e.target.value.toUpperCase())} />
          </label>
          <code className="mono-sm">{accent}</code>
        </div>
        {ratio < 3 && <div className="warn">This colour is light for text on white ({ratio.toFixed(1)}:1). Headings in it may be hard to read, especially in print.</div>}
      </section>

      <section className="f-grid">
        <Segmented path="preferences.pageSize" label="Page size" options={[["A4", "A4"], ["Letter", "Letter"]]} fallback="A4" onPick={(v) => setPref("pageSize", v === "A4" ? undefined : v)} />
        <SelectInput path="preferences.dateFormat" label="Date format" options={[["MMM YYYY", "Feb 2025"], ["MMMM YYYY", "February 2025"], ["MM/YYYY", "02/2025"], ["YYYY-MM", "2025-02"], ["YYYY", "2025"]]} fallback="MMM YYYY" />
      </section>

      {t.photoSlot && (
        <section>
          <Segmented
            path="preferences.avatar"
            label="Photo slot"
            options={[["auto", "Photo"], ["initials", "Initials"], ["none", "None"]]}
            fallback="auto"
            onPick={(v) => setPref("avatar", v === "auto" ? undefined : v)}
          />
          <div className="f-help">
            {vm.slot === "none" ? "No slot. The header reflows as if the template had none." : vm.slot === "initials" ? (p.avatar === "initials" ? `Shows ${vm.initials || "your initials"} in the accent colour.` : "No photo uploaded, so your initials show. Upload one in Basics.") : "Shows your photo."}
          </div>
        </section>
      )}

      <section>
        <label className={cx("f-check", !t.levels && "disabled")}>
          <input type="checkbox" checked={!!p.showSkillLevels && t.levels} disabled={!t.levels} onChange={(e) => setPref("showSkillLevels", e.target.checked || undefined)} />
          <span>
            <span className="f-check-label">Show skill levels</span>
            <span className="f-help">{t.levels ? "Draws dots for skills that have a level. Many recruiters read bars as self-rating, so it's off by default." : `${t.name} prints skills as text only, so levels aren't shown.`}</span>
          </span>
        </label>
      </section>

      <section className={cx("d-card fit", sparse && "fit-warn", fitOk && "fit-ok")} aria-labelledby="fit-title">
        <div className="fit-head">
          <div id="fit-title" className="d-title">Fit check · {pages.pages === 1 ? "one page" : `${pages.pages} pages`}</div>
          <span className="f-help">Body text {t.bodyPx ? bodyPt(t.bodyPx, vm.textScale) : "–"} pt</span>
        </div>
        <div className="fit-text">
          {pages.pages === 1
            ? `Everything fits on one ${sizeName} page.`
            : `Page ${pages.pages} is ${Math.round(pages.lastFill * 100)}% full.${sparse ? " Fitting it on fewer pages usually reads better." : ""}`}
        </div>
        <div className="fit-bar" aria-hidden="true"><div style={{ inlineSize: `${Math.round((pages.pages === 1 ? pages.lastFill : pages.lastFill) * 100)}%` }} /></div>
        {pages.pages > 1 && (
          <button type="button" className="btn btn-primary" disabled={atFloor} onClick={() => onFit(pages.pages - 1)}>
            Fit on {pages.pages - 1} {pages.pages - 1 === 1 ? "page" : "pages"}
          </button>
        )}
        <div className="scales">
          <label className="scale">
            <span>Text size</span>
            <input type="range" min={TEXT_SCALE.min} max={TEXT_SCALE.max} step={0.05} value={vm.textScale} onChange={(e) => setScale("textScale", +e.target.value)} />
            <output>{pct(vm.textScale)}</output>
          </label>
          <label className="scale">
            <span>Spacing</span>
            <input type="range" min={SPACING_SCALE.min} max={SPACING_SCALE.max} step={0.05} value={vm.spacingScale} onChange={(e) => setScale("spacingScale", +e.target.value)} />
            <output>{pct(vm.spacingScale)}</output>
          </label>
        </div>
        <div className="row-between">
          <button type="button" className="btn-link" disabled={vm.textScale === 1 && vm.spacingScale === 1} onClick={() => ws.update((d) => setAt(setAt(d, "preferences.textScale", undefined), "preferences.spacingScale", undefined))}>Reset to 100%</button>
          <button type="button" className="btn btn-sm" onClick={onFocusPreview}>See the pages in focus preview</button>
        </div>
        <div className="f-help">Fit lowers spacing first, then text, and stops at 85% text. The PDF uses the same values as the preview.</div>
      </section>
    </div>
  );
}

// The Content tab: one card per section, in print order. Cards reorder by drag
// (or arrow keys on the handle), hide, and rename; that writes
// preferences.sectionOrder, hiddenSections and sectionTitles.

import { useState } from "react";
import { ICONS } from "../../lib/icons";
import { getAt, move, setAt, updateList } from "../../lib/paths";
import type { Resume } from "../../lib/types";
import { DEFAULT_TITLES, SECTION_KEYS } from "../../lib/view";
import type { TemplateMeta } from "../../templates/registry";
import { useWs } from "./context";
import { Check, DragHandle, dropTarget, FieldList, RichInput, Segmented, TextInput } from "./fields";
import { SPECS, type ListSpec } from "./specs";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export interface ContentUi {
  open: string | null;
  setOpen: (k: string | null) => void;
  openItem: number;
  setOpenItem: (i: number) => void;
  template: TemplateMeta;
  onPickPhoto: () => void;
  onCrop: () => void;
}

const ALWAYS = ["summary", "work", "education", "skills"];

/** Section keys in print order, as preferences.sectionOrder resolves them. */
export function orderedKeys(doc: Resume): string[] {
  const all = [...SECTION_KEYS, ...(doc.customSections ?? []).map((c) => "custom:" + c.id)];
  const listed = (doc.preferences?.sectionOrder ?? []).filter((k) => all.includes(k));
  return [...listed, ...all.filter((k) => !listed.includes(k))];
}

/** Sections that get a card: the core four always, the rest once they have content. */
export function presentKeys(doc: Resume): string[] {
  return orderedKeys(doc).filter((k) => {
    if (ALWAYS.includes(k) || k.startsWith("custom:")) return true;
    if (k === "references") return !!doc.references;
    return !!(doc[k as keyof Resume] as unknown[] | undefined)?.length;
  });
}

const titleOf = (doc: Resume, k: string) =>
  k.startsWith("custom:") ? doc.customSections?.find((c) => "custom:" + c.id === k)?.title || "Custom section" : DEFAULT_TITLES[k];

const EYE = "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z";
const EYE_OFF = "M3 3l18 18 M10.6 6.1A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6 M6.6 6.6A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.9 M9.9 9.9a3 3 0 0 0 4.2 4.2";

export function ContentTab(ui: ContentUi) {
  const ws = useWs();
  const { doc } = ws;
  const keys = presentKeys(doc);
  const [over, setOver] = useState<number | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const hidden = new Set(doc.preferences?.hiddenSections ?? []);
  const titles = doc.preferences?.sectionTitles ?? {};
  const errIn = (prefix: string) => [...ws.errors.keys()].some((d) => d.startsWith(prefix));

  const reorder = (from: number, to: number) => {
    const visible = move(keys, from, to);
    const rest = orderedKeys(doc).filter((k) => !visible.includes(k));
    ws.update((d) => setAt(d, "preferences.sectionOrder", [...visible, ...rest]));
  };
  const toggleHidden = (k: string) =>
    ws.update((d) => {
      const h = d.preferences?.hiddenSections ?? [];
      const next = h.includes(k) ? h.filter((x) => x !== k) : [...h, k];
      return setAt(d, "preferences.hiddenSections", next.length ? next : undefined);
    });

  const addable = SECTION_KEYS.filter((k) => !keys.includes(k));
  const addSection = (k: string) => {
    setAddMenu(false);
    if (k === "custom") {
      const n = (doc.customSections?.length ?? 0) + 1;
      let id = `section-${n}`;
      while (doc.customSections?.some((c) => c.id === id)) id += "x";
      ws.update((d) => updateList(d, "customSections", (l) => l.push({ id, title: "New section", display: "entries", items: [{ title: "" }] })));
      ui.setOpen("custom:" + id);
      ui.setOpenItem(0);
      ws.focusField(`customSections.${n - 1}.title`);
      return;
    }
    if (k === "references") ws.update((d) => setAt(d, "references", { availableOnRequest: true }));
    else ws.update((d) => setAt(d, k, [SPECS[k].blank()]));
    ui.setOpen(k);
    ui.setOpenItem(0);
  };

  const card = (k: string, idx: number) => {
    const isBasics = k === "basics";
    const isCustom = k.startsWith("custom:");
    const open = ui.open === k;
    const def = isBasics ? "Basics" : titleOf(doc, k);
    const title = isBasics ? "Basics" : (!isCustom && titles[k]) || def;
    const isHidden = hidden.has(k);
    const ci = isCustom ? (doc.customSections ?? []).findIndex((c) => "custom:" + c.id === k) : -1;
    const count = isBasics || k === "summary" ? 0 : isCustom ? doc.customSections?.[ci]?.items?.length ?? 0 : k === "references" ? doc.references?.items?.length ?? 0 : ((doc[k as keyof Resume] as unknown[] | undefined)?.length ?? 0);
    const hasErr = isBasics ? errIn("basics.") && ![...ws.errors.keys()].every((d) => d.startsWith("basics.summary")) : errIn((isCustom ? `customSections.${ci}` : k === "summary" ? "basics.summary" : k) + (k === "summary" ? "" : "."));
    const inSidebar = ui.template.columns === 2 && (ui.template.side ?? []).includes(k);
    return (
      <div
        key={k}
        className={cx("card", isHidden && "is-hidden", over === idx && "over")}
        {...(isBasics ? {} : dropTarget("sections", idx, reorder, setOver))}
      >
        <div className="card-head">
          {isBasics ? <span className="drag-space" /> : <DragHandle label={title} list="sections" index={idx} onMove={(d) => idx + d >= 0 && idx + d < keys.length && reorder(idx, idx + d)} />}
          <button type="button" className="card-title" aria-expanded={open} onClick={() => { ui.setOpen(open ? null : k); ui.setOpenItem(0); }}>
            <span className="card-name">{title}</span>
            {!isBasics && !isCustom && titles[k] && titles[k] !== def && <span className="card-def">({def})</span>}
            {count > 0 && <span className="pill">{count}</span>}
            {inSidebar && <span className="pill pill-line" title={`${ui.template.name} puts this section in the sidebar, so moving it above a main-column section changes nothing`}>Sidebar</span>}
            {hasErr && <span className="dot-err" aria-label="Has problems" />}
          </button>
          {!isBasics && (
            <button type="button" className={cx("icon-btn", isHidden && "danger-on")} aria-label={isHidden ? `Show ${title} on resume` : `Hide ${title} from resume`} title={isHidden ? "Show on resume" : "Hide from resume"} onClick={() => toggleHidden(k)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={isHidden ? EYE_OFF : EYE} /></svg>
            </button>
          )}
          <button type="button" className="icon-btn" tabIndex={-1} aria-hidden="true" onClick={() => ui.setOpen(open ? null : k)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
        {open && (
          <div className="card-body">
            {!isBasics && !isCustom && (
              <TextInput path={`preferences.sectionTitles.${k}`} label="Section heading" placeholder={def} help={`Printed as the heading. Leave empty to use “${def}”.`} max={200} />
            )}
            {isBasics && <BasicsEditor onPickPhoto={ui.onPickPhoto} onCrop={ui.onCrop} />}
            {k === "summary" && <RichInput path="basics.summary" label="Summary" max={1500} placeholder="2–5 sentences: what you do, for whom, and your strongest results." />}
            {k === "skills" && <SkillsEditor />}
            {k === "references" && (
              <>
                <Check path="references.availableOnRequest" label="Print “References available on request”" help="Shown only when you list no referees below." />
                <ListEditor spec={SPECS["references.items"]} base="references.items" ui={ui} />
              </>
            )}
            {isCustom && ci >= 0 && (
              <>
                <TextInput path={`customSections.${ci}.title`} label="Section heading" required max={200} />
                <Segmented
                  path={`customSections.${ci}.display`}
                  label="Shown as"
                  options={[["entries", "Entries"], ["bullets", "Bullets"], ["tags", "Tags"], ["text", "Text"]]}
                  fallback="entries"
                  onPick={(v) => ws.set(`customSections.${ci}.display`, v)}
                />
                <ListEditor spec={SPECS.custom} base={`customSections.${ci}.items`} ui={ui} />
                <button type="button" className="btn-link danger" onClick={() => {
                  const prev = doc;
                  ws.update((d) => updateList(d, "customSections", (l) => l.splice(ci, 1)));
                  ws.toast(`Removed “${title}”.`, prev);
                }}>Remove this section</button>
              </>
            )}
            {SPECS[k] && <ListEditor spec={SPECS[k]} base={k} ui={ui} />}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="cards">
      {card("basics", -1)}
      {keys.map((k, i) => card(k, i))}
      <div className="add-wrap">
        <button type="button" className="add-section" aria-expanded={addMenu} onClick={() => setAddMenu(!addMenu)}>+ Add section</button>
        {addMenu && (
          <div role="menu" className="menu add-menu">
            {addable.map((k) => (
              <button key={k} type="button" role="menuitem" className="menu-item" onClick={() => addSection(k)}>{DEFAULT_TITLES[k]}</button>
            ))}
            <button type="button" role="menuitem" className="menu-item menu-wide" onClick={() => addSection("custom")}>
              Custom section…
              <span className="menu-sub">Talks, Patents, Leadership. Shown as entries, bullets, tags or text.</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ListEditor({ spec, base, ui }: { spec: ListSpec; base: string; ui: ContentUi }) {
  const ws = useWs();
  const items = (getAt(ws.doc, base) as Record<string, any>[] | undefined) ?? [];
  const [over, setOver] = useState<number | null>(null);
  const errIn = (prefix: string) => [...ws.errors.keys()].some((d) => d.startsWith(prefix));
  const reorder = (from: number, to: number) => {
    ws.update((d) => updateList(d, base, (l) => l.splice(0, l.length, ...move(l, from, to))));
    if (ui.openItem === from) ui.setOpenItem(to);
  };
  const add = () => {
    const at = spec.newFirst ? 0 : items.length;
    ws.update((d) => updateList(d, base, (l) => (spec.newFirst ? l.unshift(spec.blank()) : l.push(spec.blank()))));
    ui.setOpenItem(at);
    const first = spec.fields[0];
    ws.focusField(`${base}.${at}.${first.k === "dates" ? first.start : "path" in first ? first.path : ""}`);
  };
  return (
    <div className="items">
      {spec.newFirst && <button type="button" className="btn-link" onClick={add}>{spec.add}</button>}
      {!items.length && spec.empty && <div className="empty">{spec.empty}</div>}
      {items.map((it, i) => {
        const open = ui.openItem === i;
        const he = errIn(`${base}.${i}.`) || ws.errors.has(`${base}.${i}`);
        return (
          <div key={i} className={cx("item", open && "open", he && "invalid", over === i && "over")} {...dropTarget(base, i, reorder, setOver)}>
            <div className="item-head">
              <DragHandle label={spec.heading(it)} list={base} index={i} onMove={(d) => i + d >= 0 && i + d < items.length && reorder(i, i + d)} />
              <button type="button" className="item-title" aria-expanded={open} onClick={() => ui.setOpenItem(open ? -1 : i)}>
                <span className="item-name">{spec.heading(it)}</span>
                <span className={cx("item-sub", he && "err")}>{he ? "Has problems · " : ""}{spec.sub(it)}</span>
              </button>
              {spec.duplicate && (
                <button type="button" className="icon-btn" title="Duplicate (for a promotion)" aria-label="Duplicate (for a promotion)" onClick={() => {
                  ws.update((d) => updateList(d, base, (l) => {
                    const c = structuredClone(l[i]) as Record<string, unknown>;
                    delete c.id;
                    c.title = "";
                    c.startDate = "";
                    c.endDate = "present";
                    l.splice(i, 0, c);
                  }));
                  ui.setOpenItem(i);
                  ws.toast("Duplicated above. Add the new title and dates for the promotion.");
                  ws.focusField(`${base}.${i}.title`);
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 9h11v11H9z M5 15H4V4h11v1" /></svg>
                </button>
              )}
              <button type="button" className="icon-btn danger" title={`Delete ${spec.noun}`} aria-label={`Delete ${spec.noun} ${spec.heading(it)}`} onClick={() => {
                const prev = ws.doc;
                ws.update((d) => updateList(d, base, (l) => l.splice(i, 1)));
                ws.toast(`Deleted ${spec.noun}.`, prev);
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13" /></svg>
              </button>
            </div>
            {open && (
              <div className="item-body">
                <FieldList base={`${base}.${i}`} fields={spec.fields} />
              </div>
            )}
          </div>
        );
      })}
      {!spec.newFirst && <button type="button" className="btn-link" onClick={add}>{spec.add}</button>}
    </div>
  );
}

const NETWORKS: [string, string][] = [
  ["linkedin", "LinkedIn"], ["github", "GitHub"], ["gitlab", "GitLab"], ["stackoverflow", "Stack Overflow"], ["x", "X"], ["mastodon", "Mastodon"],
  ["bluesky", "Bluesky"], ["medium", "Medium"], ["devto", "DEV"], ["behance", "Behance"], ["dribbble", "Dribbble"], ["kaggle", "Kaggle"],
  ["leetcode", "LeetCode"], ["orcid", "ORCID"], ["googlescholar", "Google Scholar"], ["youtube", "YouTube"], ["npm", "npm"], ["other", "Other"],
];

function BasicsEditor({ onPickPhoto, onCrop }: { onPickPhoto: () => void; onCrop: () => void }) {
  const ws = useWs();
  const b = ws.doc.basics ?? { name: "" };
  const photo = b.photo?.src;
  const initials = (b.initials || (b.name ?? "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("")).toUpperCase() || "?";
  const profiles = b.profiles ?? [];
  const extras = b.extras ?? [];
  return (
    <div className="fields">
      <TextInput path="basics.name" label="Full name" required max={200} />
      <TextInput path="basics.headline" label="Headline" placeholder="e.g. Lead Engineer" help="The line under your name. Your current title, or title plus focus areas." max={200} />
      <div className="photo-row">
        {photo ? <img src={photo} alt="Your photo" className="photo-thumb" /> : <div aria-hidden="true" className="photo-thumb photo-initials">{initials}</div>}
        <div className="photo-actions">
          <div className="row-gap">
            <button type="button" className="btn btn-sm" data-field="basics.photo" onClick={onPickPhoto}>{photo ? "Replace photo" : "Upload photo"}</button>
            {photo && <button type="button" className="btn btn-sm" onClick={onCrop}>Crop</button>}
            {photo && <button type="button" className="btn-link danger" onClick={() => ws.set("basics.photo", undefined)}>Remove</button>}
          </div>
          <span className="f-help">Optional. Only templates with a photo slot show it; others use your initials or nothing.</span>
        </div>
      </div>
      <div className="f-grid">
        <TextInput path="basics.email" label="Email" type="email" />
        <TextInput path="basics.phone" label="Phone" type="tel" placeholder="+91 98765 43210" />
      </div>
      <div className="f">
        <span className="f-label">Location</span>
        <div className="f-grid3">
          <TextInput bare path="basics.location.city" label="City" placeholder="City" />
          <TextInput bare path="basics.location.region" label="State / region" placeholder="State / region" />
          <TextInput bare path="basics.location.country" label="Country" placeholder="Country" />
        </div>
      </div>
      <div className="f-grid f-grid-32">
        <TextInput path="basics.website.url" label="Website" type="url" placeholder="https://" />
        <TextInput path="basics.website.label" label="Shown as" placeholder="Portfolio" />
      </div>
      <div className="f">
        <span className="f-label">Profiles</span>
        <div className="profiles">
          {profiles.map((p, i) => (
            <div key={i} className="profile-row">
              <span className="profile-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={(ICONS as Record<string, string>)[p.network] ?? ICONS.link} /></svg>
              </span>
              <select className="f-input" aria-label="Network" data-field={`basics.profiles.${i}.network`} value={p.network} onChange={(e) => ws.set(`basics.profiles.${i}.network`, e.target.value)}>
                {NETWORKS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <TextInput bare path={`basics.profiles.${i}.url`} label="Profile URL" placeholder="https://" type="url" />
              <button type="button" className="icon-btn danger" aria-label="Remove profile" onClick={() => ws.update((d) => updateList(d, "basics.profiles", (l) => l.splice(i, 1)))}>✕</button>
            </div>
          ))}
          {profiles.map((_, i) => ws.errors.get(`basics.profiles.${i}.url`) && <span key={"e" + i} className="f-error">Profile {i + 1}: {ws.errors.get(`basics.profiles.${i}.url`)!.field}</span>)}
          <button type="button" className="btn-link" onClick={() => {
            ws.update((d) => updateList(d, "basics.profiles", (l) => l.push({ network: "linkedin", url: "" })));
            ws.focusField(`basics.profiles.${profiles.length}.url`);
          }}>+ Add profile</button>
        </div>
      </div>
      <div className="f">
        <span className="f-label">Other details <span className="f-opt">(optional)</span></span>
        <span className="f-help">Facts some markets expect in the header: notice period, visa status.</span>
        {extras.map((x, i) => (
          <div key={i} className="extra-row">
            <TextInput bare path={`basics.extras.${i}.label`} label="Label" placeholder="Notice period" />
            <TextInput bare path={`basics.extras.${i}.value`} label="Value" placeholder="30 days" />
            <button type="button" className="icon-btn danger" aria-label={`Remove ${x.label || "detail"}`} onClick={() => ws.update((d) => updateList(d, "basics.extras", (l) => l.splice(i, 1)))}>✕</button>
          </div>
        ))}
        {extras.length < 6 && <button type="button" className="btn-link" onClick={() => ws.update((d) => updateList(d, "basics.extras", (l) => l.push({ label: "", value: "" })))}>+ Add detail</button>}
      </div>
    </div>
  );
}

function SkillsEditor() {
  const ws = useWs();
  const groups = (ws.doc.skills ?? []) as { name?: string; items: { name: string; level?: number }[] }[];
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [over, setOver] = useState<number | null>(null);
  const reorder = (from: number, to: number) => ws.update((d) => updateList(d, "skills", (l) => l.splice(0, l.length, ...move(l, from, to))));
  const addChip = (gi: number) => {
    const v = (drafts[gi] ?? "").trim();
    if (!v) return;
    ws.update((d) => updateList(d, `skills.${gi}.items`, (l) => v.split(/\s*,\s*/).filter(Boolean).forEach((n) => l.push({ name: n }))));
    setDrafts({ ...drafts, [gi]: "" });
  };
  return (
    <div className="items">
      {!groups.length && <div className="empty">Add a group like “Frontend” or “Tools”, or one unnamed group for a flat list.</div>}
      {groups.map((g, gi) => (
        <div key={gi} className={cx("skill-group", over === gi && "over", ws.active?.startsWith(`skills.${gi}.`) && "active")} {...dropTarget("skills", gi, reorder, setOver)}>
          <div className="skill-head">
            <DragHandle label={g.name || `group ${gi + 1}`} list="skills" index={gi} onMove={(d) => gi + d >= 0 && gi + d < groups.length && reorder(gi, gi + d)} />
            <TextInput bare path={`skills.${gi}.name`} label="Group name" placeholder="Group name (optional)" className="skill-name" />
            <button type="button" className="icon-btn danger" aria-label={`Delete group ${g.name || gi + 1}`} onClick={() => {
              const prev = ws.doc;
              ws.update((d) => updateList(d, "skills", (l) => l.splice(gi, 1)));
              ws.toast("Deleted skill group.", prev);
            }}>✕</button>
          </div>
          <div className="chips chips-skills">
            {(g.items ?? []).map((it, k) => {
              const path = `skills.${gi}.items.${k}`;
              const lv = it.level ?? 0;
              return (
                <span key={k} className={cx("chip", ws.active === path && "active", ws.errors.has(`${path}.name`) && "invalid")} data-field={path} tabIndex={0}>
                  {it.name}
                  <button type="button" className="chip-level" title={lv ? `Level ${lv} of 5. Click to change.` : "No level. Click to set one."} aria-label={lv ? `${it.name}: level ${lv} of 5. Change level` : `${it.name}: set a level`} onClick={() => ws.set(`${path}.level`, lv >= 5 ? undefined : lv + 1)}>
                    {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= lv ? "on" : undefined} />)}
                  </button>
                  <button type="button" className="chip-x" aria-label={`Remove ${it.name}`} onClick={() => ws.update((d) => updateList(d, `skills.${gi}.items`, (l) => l.splice(k, 1)))}>✕</button>
                </span>
              );
            })}
            <input
              className="chips-input"
              data-field={`skills.${gi}.items`}
              value={drafts[gi] ?? ""}
              placeholder="Type a skill, press Enter"
              aria-label={`Add skill to ${g.name || "group " + (gi + 1)}`}
              onChange={(e) => setDrafts({ ...drafts, [gi]: e.target.value })}
              onBlur={() => addChip(gi)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addChip(gi);
                } else if (e.key === "Backspace" && !(drafts[gi] ?? "") && g.items?.length) {
                  ws.update((d) => updateList(d, `skills.${gi}.items`, (l) => l.pop()));
                }
              }}
            />
          </div>
          {ws.errors.get(`skills.${gi}.items`) && <span className="f-error">{ws.errors.get(`skills.${gi}.items`)!.field}</span>}
        </div>
      ))}
      <div className="row-between">
        <button type="button" className="btn-link" onClick={() => {
          ws.update((d) => updateList(d, "skills", (l) => l.push({ name: "", items: [] })));
          ws.focusField(`skills.${groups.length}.name`);
        }}>+ Add group</button>
        <span className="f-help">Dots set an optional level (1–5), shown only when the template and the Design tab allow.</span>
      </div>
    </div>
  );
}


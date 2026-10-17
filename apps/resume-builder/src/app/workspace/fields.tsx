// Form controls. Every input carries data-field (its dot path in the
// document): focusing it highlights the matching element in the preview, and
// click-to-edit finds it by that attribute.

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DATE_RE, formatDate } from "../../lib/format";
import { getAt, move, updateList } from "../../lib/paths";
import { useWs } from "./context";
import type { Field } from "./specs";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

function useField(path: string) {
  const ws = useWs();
  const raw = getAt(ws.doc, path);
  const err = ws.errors.get(path);
  return { ws, raw, value: raw == null ? "" : String(raw), err, active: ws.active === path };
}

function Label({ text, required, extra }: { text: string; required?: boolean; extra?: ReactNode }) {
  return (
    <span className="f-label">
      <span>
        {text}
        {required && <span className="f-req" aria-hidden="true"> *</span>}
      </span>
      {extra}
    </span>
  );
}

function Count({ len, max }: { len: number; max?: number }) {
  if (!max || len < max * 0.8) return null;
  return <span className={cx("f-count", len > max && "over")}>{len} / {max}</span>;
}

export function ErrorText({ path }: { path: string }) {
  const err = useWs().errors.get(path);
  return err ? <span className="f-error">{err.field || err.problem}</span> : null;
}

export function TextInput(props: { path: string; label: string; required?: boolean; placeholder?: string; help?: string; max?: number; type?: string; bare?: boolean; className?: string }) {
  const { ws, value, err, active } = useField(props.path);
  const input = (
    <input
      className={cx("f-input", err && "invalid", active && "active", props.className)}
      data-field={props.path}
      type={props.type === "url" ? "text" : props.type ?? "text"}
      inputMode={props.type === "url" ? "url" : undefined}
      value={value}
      placeholder={props.placeholder}
      aria-label={props.bare ? props.label : undefined}
      aria-invalid={!!err}
      onChange={(e) => ws.set(props.path, e.target.value)}
    />
  );
  if (props.bare) return input;
  return (
    <label className="f">
      <Label text={props.label} required={props.required} extra={<Count len={value.length} max={props.max} />} />
      {input}
      {err ? <span className="f-error">{err.field || err.problem}</span> : props.help && <span className="f-help">{props.help}</span>}
    </label>
  );
}

/** Wrap the selection in markup: **bold**, *italic* or [text](https://). */
function wrapSelection(el: HTMLTextAreaElement, mark: "**" | "*" | "link", set: (v: string) => void) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const sel = value.slice(s, e) || (mark === "link" ? "link text" : "text");
  const ins = mark === "link" ? `[${sel}](https://)` : mark + sel + mark;
  set(value.slice(0, s) + ins + value.slice(e));
  const a = s + (mark === "link" ? 1 : mark.length);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(a, a + sel.length);
  });
}

function Toolbar({ target, set }: { target: () => HTMLTextAreaElement | null; set: (v: string) => void }) {
  const b = (mark: "**" | "*" | "link", label: string, body: ReactNode, cls: string) => (
    <button
      type="button"
      className={cx("f-tool", cls)}
      aria-label={label}
      title={label}
      onMouseDown={(e) => {
        e.preventDefault();
        const el = target();
        if (el) wrapSelection(el, mark, set);
      }}
    >
      {body}
    </button>
  );
  return (
    <span className="f-tools">
      {b("**", "Bold (Ctrl+B)", "B", "bold")}
      {b("*", "Italic (Ctrl+I)", "I", "italic")}
      {b("link", "Link (Ctrl+K)", <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>, "")}
    </span>
  );
}

function richKeys(e: KeyboardEvent<HTMLTextAreaElement>, set: (v: string) => void) {
  if (!(e.metaKey || e.ctrlKey)) return;
  const k = e.key.toLowerCase();
  const mark = k === "b" ? "**" : k === "i" ? "*" : k === "k" ? "link" : null;
  if (mark) {
    e.preventDefault();
    wrapSelection(e.currentTarget, mark, set);
  }
}

export function RichInput({ path, label, max, placeholder }: { path: string; label: string; max: number; placeholder?: string }) {
  const { ws, value, err, active } = useField(path);
  const ref = useRef<HTMLTextAreaElement>(null);
  const set = (v: string) => ws.set(path, v);
  return (
    <div className="f">
      <Label text={label} extra={<Toolbar target={() => ref.current} set={set} />} />
      <textarea
        ref={ref}
        className={cx("f-input f-area", err && "invalid", active && "active")}
        data-field={path}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => richKeys(e, set)}
      />
      <span className="f-help f-row">
        <span>{err ? <span className="f-error">{err.field || err.problem}</span> : "**bold**, *italic* and [links](https://…) are kept. Nothing else."}</span>
        <Count len={value.length} max={max} />
      </span>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 60 }, (_, i) => String(THIS_YEAR + 2 - i));

/**
 * Month + year pickers. "Present" for end dates. A value the pickers can't
 * show (an imported "Feb 2025") stays visible as raw text, marked, with a
 * one-click fix when we can guess it.
 */
export function DateInput({ path, label, required, allowPresent }: { path: string; label: string; required?: boolean; allowPresent?: boolean }) {
  const { ws, value, err, active } = useField(path);
  const present = value === "present";
  const valid = !value || DATE_RE.test(value);
  const [y, m] = valid && value ? value.split("-") : ["", ""];
  const setPart = (part: "y" | "m", v: string) => {
    let [yy, mm] = [y, m];
    if (part === "y") yy = v;
    else mm = v;
    if (!yy && mm) yy = String(THIS_YEAR);
    ws.set(path, yy ? (mm ? `${yy}-${mm}` : yy) : "");
  };
  return (
    <div className="f">
      <span className="f-label">
        <span>
          {label}
          {required && <span className="f-req" aria-hidden="true"> *</span>}
        </span>
        {allowPresent && (
          <label className="f-inline">
            <input type="checkbox" checked={present} data-field={present ? path : undefined} onChange={(e) => ws.set(path, e.target.checked ? "present" : "")} />
            Present
          </label>
        )}
      </span>
      {present ? (
        <div className="f-input f-static">Present</div>
      ) : valid ? (
        <div className="f-date">
          <select className={cx("f-input", err && "invalid", active && "active")} data-field={path} aria-label={`${label} month`} value={m ?? ""} onChange={(e) => setPart("m", e.target.value)}>
            <option value="">Month</option>
            {MONTHS.map((t, i) => (
              <option key={t} value={String(i + 1).padStart(2, "0")}>{t}</option>
            ))}
          </select>
          <select className={cx("f-input", err && "invalid")} aria-label={`${label} year`} value={y} onChange={(e) => setPart("y", e.target.value)}>
            <option value="">Year</option>
            {(y && !YEARS.includes(y) ? [y, ...YEARS] : YEARS).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <input className={cx("f-input invalid", active && "active")} data-field={path} value={value} aria-invalid="true" aria-label={label} onChange={(e) => ws.set(path, e.target.value)} />
          {err?.fix && (
            <button type="button" className="btn btn-sm f-fix" onClick={() => ws.set(path, err.fix)}>
              Use {err.fix === "present" ? "Present" : formatDate(err.fix, "MMM YYYY", "en-US")}
            </button>
          )}
        </div>
      )}
      <ErrorText path={path} />
    </div>
  );
}

export function SelectInput({ path, label, options, fallback }: { path: string; label: string; options: [string, string][]; fallback?: string }) {
  const f = useField(path);
  const { ws, err, active } = f;
  const value = f.value || fallback || "";
  const opts = value && !options.some((o) => o[0] === value) ? [[value, `${value} (not valid)`] as [string, string], ...options] : options;
  return (
    <label className="f">
      <Label text={label} />
      <select className={cx("f-input", err && "invalid", active && "active")} data-field={path} value={value} onChange={(e) => ws.set(path, e.target.value === fallback ? "" : e.target.value)}>
        {opts.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
      <ErrorText path={path} />
    </label>
  );
}

export function Segmented({ path, label, options, onPick, fallback }: { path: string; label: string; options: [string, string][]; onPick?: (v: string) => void; fallback?: string }) {
  const f = useField(path);
  const { ws } = f;
  const value = f.value || fallback || "";
  return (
    <div className="f">
      <span className="f-label">{label}</span>
      <div role="radiogroup" aria-label={label} className="seg">
        {options.map(([v, t]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            data-field={value === v ? path : undefined}
            className={cx("seg-btn", value === v && "on")}
            onClick={() => (onPick ? onPick(v) : ws.set(path, value === v ? "" : v))}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorText path={path} />
    </div>
  );
}

/** A list of strings as removable chips; Enter adds, Backspace on empty removes the last. */
export function Chips({ path, label, placeholder }: { path: string; label: string; placeholder?: string }) {
  const { ws, raw } = useField(path);
  const list = Array.isArray(raw) ? (raw as string[]) : [];
  const [draft, setDraft] = useState("");
  const setList = (next: string[]) => ws.set(path, next.length ? next : undefined);
  const add = () => {
    const v = draft.trim().replace(/,$/, "");
    if (v) setList([...list, ...v.split(/\s*,\s*/).filter(Boolean)]);
    setDraft("");
  };
  return (
    <div className="f">
      <span className="f-label">{label}</span>
      <div className="chips">
        {list.map((t, i) => (
          <span key={i} className="chip">
            {t}
            <button type="button" className="chip-x" aria-label={`Remove ${t}`} onClick={() => setList(list.filter((_, j) => j !== i))}>✕</button>
          </span>
        ))}
        <input
          className="chips-input"
          data-field={path}
          value={draft}
          placeholder={placeholder}
          aria-label={`Add to ${label}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && list.length) setList(list.slice(0, -1));
          }}
        />
      </div>
      <ErrorText path={path} />
    </div>
  );
}

export function Check({ path, label, help }: { path: string; label: string; help?: string }) {
  const { ws, raw } = useField(path);
  return (
    <label className="f-check">
      <input type="checkbox" data-field={path} checked={!!raw} onChange={(e) => ws.set(path, e.target.checked || undefined)} />
      <span>
        <span className="f-check-label">{label}</span>
        {help && <span className="f-help">{help}</span>}
      </span>
    </label>
  );
}

export function DragHandle({ label, onMove, index, list, onDragStart, onDragEnd }: { label: string; onMove: (delta: number) => void; index: number; list: string; onDragStart?: () => void; onDragEnd?: () => void }) {
  return (
    <span
      className="drag"
      draggable
      tabIndex={0}
      role="button"
      title="Drag, or use the arrow keys, to reorder"
      aria-label={`Reorder ${label}. Use the up and down arrow keys.`}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-folio", JSON.stringify({ list, index }));
        const row = (e.currentTarget as HTMLElement).closest("[data-drow]");
        if (row) e.dataTransfer.setDragImage(row, 16, 16);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onMove(-1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          onMove(1);
        }
      }}
    >
      <svg width="10" height="14" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
        {[3, 8, 13].flatMap((cy) => [3, 9].map((cxv) => <circle key={`${cxv}-${cy}`} cx={cxv} cy={cy} r="1.4" />))}
      </svg>
    </span>
  );
}

/** Props for a row that accepts drops from DragHandles of the same list. */
export function dropTarget(list: string, index: number, onDrop: (from: number, to: number) => void, setOver?: (i: number | null) => void) {
  return {
    "data-drow": "1",
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("text/x-folio")) {
        e.preventDefault();
        setOver?.(index);
      }
    },
    onDragLeave: () => setOver?.(null),
    onDrop: (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData("text/x-folio");
      setOver?.(null);
      if (!raw) return;
      const d = JSON.parse(raw) as { list: string; index: number };
      if (d.list !== list) return;
      e.preventDefault();
      e.stopPropagation();
      if (d.index !== index) onDrop(d.index, index);
    },
  };
}

/** Bullets with an optional bold lead-in, reorderable, up to 12. */
export function Bullets({ path }: { path: string }) {
  const ws = useWs();
  const list = (getAt(ws.doc, path) as { label?: string; text?: string }[] | undefined) ?? [];
  const [over, setOver] = useState<number | null>(null);
  const reorder = (from: number, to: number) => ws.update((d) => updateList(d, path, (l) => l.splice(0, l.length, ...move(l, from, to))));
  const add = () => {
    ws.update((d) => updateList(d, path, (l) => l.push({ text: "" })));
    ws.focusField(`${path}.${list.length}.text`);
  };
  return (
    <div className="f">
      <span className="f-label">
        <span>Bullets</span>
        <span className="f-count">{list.length} / 12</span>
      </span>
      <div className="bullets">
        {list.map((b, j) => {
          const base = `${path}.${j}`;
          const active = ws.active === base + ".text" || ws.active === base + ".label";
          const err = ws.errors.get(base + ".text") ?? ws.errors.get(base) ?? ws.errors.get(base + ".label");
          return (
            <div key={j} className={cx("bullet", active && "active", over === j && "over", err && "invalid")} {...dropTarget(path, j, reorder, setOver)}>
              <DragHandle label={`bullet ${j + 1}`} list={path} index={j} onMove={(dl) => j + dl >= 0 && j + dl < list.length && reorder(j, j + dl)} />
              <div className="bullet-body">
                <input
                  className="bullet-label"
                  data-field={base + ".label"}
                  value={b.label ?? ""}
                  placeholder="Bold lead-in (optional)"
                  aria-label={`Bullet ${j + 1} bold lead-in`}
                  onChange={(e) => ws.set(base + ".label", e.target.value)}
                />
                <BulletText path={base + ".text"} index={j} />
                {err && <span className="f-error">{err.field || err.problem}</span>}
              </div>
              <button type="button" className="icon-btn danger" aria-label={`Delete bullet ${j + 1}`} onClick={() => ws.update((d) => updateList(d, path, (l) => l.splice(j, 1)))}>✕</button>
            </div>
          );
        })}
        {list.length < 12 && (
          <button type="button" className="btn-link" onClick={add}>+ Add bullet</button>
        )}
      </div>
    </div>
  );
}

function BulletText({ path, index }: { path: string; index: number }) {
  const { ws, value, active } = useField(path);
  const ref = useRef<HTMLTextAreaElement>(null);
  const set = (v: string) => ws.set(path, v);
  return (
    <>
      <textarea
        ref={ref}
        className="bullet-text"
        data-field={path}
        rows={1}
        value={value}
        placeholder="What you did and the result, with a number if you have one."
        aria-label={`Bullet ${index + 1} text`}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => richKeys(e, set)}
      />
      {active && (
        <span className="bullet-tools">
          <Toolbar target={() => ref.current} set={set} />
          <Count len={value.length} max={500} />
        </span>
      )}
    </>
  );
}

/** The fields of one list item, laid out from its spec (consecutive half-width fields share a row). */
export function FieldList({ base, fields }: { base: string; fields: Field[] }) {
  const rows: Field[][] = [];
  for (const f of fields) {
    const last = rows[rows.length - 1];
    if ("half" in f && f.half && last?.length === 1 && "half" in last[0] && last[0].half) last.push(f);
    else rows.push([f]);
  }
  return (
    <div className="fields">
      {rows.map((row, i) => (
        <div key={i} className={row.length > 1 ? "f-grid" : undefined}>
          {row.map((f) => (
            <FieldView key={"path" in f ? f.path : f.k + i} base={base} f={f} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FieldView({ base, f }: { base: string; f: Field }) {
  const p = (x: string) => `${base}.${x}`;
  switch (f.k) {
    case "text":
      return <TextInput path={p(f.path)} label={f.label} required={f.required} placeholder={f.placeholder} help={f.help} max={f.max} type={f.type} />;
    case "rich":
      return <RichInput path={p(f.path)} label={f.label} max={f.max} placeholder={f.placeholder} />;
    case "dates":
      return (
        <div className="f-grid">
          <DateInput path={p(f.start)} label={f.startLabel ?? "Start"} required={f.startRequired} />
          <DateInput path={p(f.end)} label={f.endLabel ?? "End"} allowPresent />
        </div>
      );
    case "date":
      return <DateInput path={p(f.path)} label={f.label} />;
    case "select":
      return <SelectInput path={p(f.path)} label={f.label} options={f.options} />;
    case "segmented":
      return <Segmented path={p(f.path)} label={f.label} options={f.options} />;
    case "chips":
      return <Chips path={p(f.path)} label={f.label} placeholder={f.placeholder} />;
    case "bullets":
      return <Bullets path={p(f.path)} />;
    case "check":
      return <Check path={p(f.path)} label={f.label} help={f.help} />;
  }
}

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { clone, DEFAULT_DOC, metricsFor, type Doc, type Row, type TextKey } from "../doc";
import { FONTS, type Settings } from "../settings";
import Editable from "./Editable";

export const PAGE_W = 1055;
export const PAGE_H = 1491;

interface Props {
  doc: Doc;
  update: (fn: (d: Doc) => void) => void;
  settings: Settings;
  /** Current on-screen scale of the page, so dragging the photo moves it with the pointer. */
  scale: number;
  onPickPhoto: () => void;
  onZoom: (dz: number) => void;
}

// All coordinates are page pixels measured from the reference image (see design/Biodata.dc.html).
export default function Page({ doc: d, update, settings, scale, onPickPhoto, onZoom }: Props) {
  const T = d.type;
  const editing = settings.editing;
  const head = settings.headColor;

  const setText = (k: TextKey) => (v: string) =>
    update((x) => {
      x[k] = v;
    });

  const rows = (get: (x: Doc) => { rows: Row[] }, cls: string, style: CSSProperties, wrapValue: boolean) =>
    get(d).rows.map((r, i) => (
      <div key={i} className={cls} style={style}>
        <Editable value={r[0]} onChange={(v) => update((x) => void (get(x).rows[i][0] = v))} />
        <div>:</div>
        <Editable
          value={r[1]}
          onChange={(v) => update((x) => void (get(x).rows[i][1] = v))}
          style={wrapValue ? { textWrap: "pretty" } as CSSProperties : undefined}
        />
        {editing && (
          <button className="pg-btn pg-remove" title="Remove row" onClick={() => update((x) => void get(x).rows.splice(i, 1))}>
            ×
          </button>
        )}
      </div>
    ));

  return (
    <div
      className="page"
      style={
        {
          "--hs": T.hs,
          "--bs": T.bs,
          "--ls": T.ls,
          fontFamily: FONTS[settings.font],
          color: settings.textColor,
        } as CSSProperties
      }
    >
      <img className="page-bg" src="background.png" alt="" onError={(e) => (e.currentTarget.style.display = "none")} />

      <Photo doc={d} update={update} scale={scale} onPick={onPickPhoto} onZoom={onZoom} />

      <div style={{ position: "absolute", left: 331, top: 144, width: 400, textAlign: "center", fontWeight: 700, color: head }}>
        <Editable
          value={d.skt1}
          onChange={setText("skt1")}
          style={{
            fontFamily: "'Noto Serif Devanagari', serif",
            fontSize: "calc(25px * var(--hs))",
            lineHeight: "calc(34px * var(--hs) * var(--ls))",
            fontStretch: "88%",
          }}
        />
        <Editable
          value={d.skt2}
          onChange={setText("skt2")}
          style={{
            fontSize: "calc(22px * var(--hs))",
            lineHeight: "calc(28px * var(--hs) * var(--ls))",
            fontWeight: 600,
            fontStretch: "78%",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 452,
          top: 219,
          width: 504,
          textAlign: "center",
          fontWeight: 700,
          fontSize: "calc(46px * var(--hs))",
          lineHeight: "calc(50px * var(--hs) * var(--ls))",
          fontStretch: "82%",
          color: head,
          textShadow: "0 1px 0 rgba(255,255,255,.55),0 1px 2px rgba(60,10,0,.25)",
        }}
      >
        <Editable value={d.title1} onChange={setText("title1")} />
        <Editable value={d.title2} onChange={setText("title2")} style={{ paddingLeft: 20 }} />
      </div>

      <div style={{ position: "absolute", left: 490, top: 338, width: 460 }}>
        <Editable
          value={d.personal.title}
          onChange={(v) => update((x) => void (x.personal.title = v))}
          style={{
            fontSize: "calc(31px * var(--hs))",
            lineHeight: "calc(42px * var(--hs) * var(--ls))",
            fontWeight: 700,
            fontStretch: "80%",
            letterSpacing: 0,
            color: head,
          }}
        />
        {rows(
          (x) => x.personal,
          "pg-row",
          { gridTemplateColumns: "196px 12px minmax(0,1fr)", fontSize: 25.5 * T.bs, lineHeight: `${34 * T.bs * T.ls}px` },
          false,
        )}
        {editing && (
          <button className="pg-btn pg-add" onClick={() => update((x) => void x.personal.rows.push(["Label", "Value"]))}>
            + Row
          </button>
        )}
      </div>

      <div style={{ position: "absolute", left: 205, top: 641, width: 680 }}>
        {d.sections.map((s, si) => {
          const m = metricsFor(s.style);
          return (
            <div key={si} style={{ paddingTop: si === 0 ? 0 : m.gap * T.sg }}>
              <div style={{ position: "relative", textAlign: "center", marginLeft: m.shift * 2 }}>
                <Editable
                  as="span"
                  value={s.title}
                  onChange={(v) => update((x) => void (x.sections[si].title = v))}
                  style={{
                    fontSize: "calc(31px * var(--hs))",
                    lineHeight: `${m.headLH * T.hs * T.ls}px`,
                    fontWeight: 700,
                    fontStretch: "77%",
                    color: head,
                  }}
                />
                {editing && (
                  <span className="pg-sec-tools">
                    <button
                      className="pg-btn"
                      title="Move up"
                      onClick={() =>
                        update((x) => {
                          if (si > 0) x.sections.splice(si - 1, 0, ...x.sections.splice(si, 1));
                        })
                      }
                    >
                      ↑
                    </button>
                    <button className="pg-btn" onClick={() => update((x) => void x.sections.splice(si, 1))}>
                      Remove section
                    </button>
                  </span>
                )}
              </div>
              {rows(
                (x) => x.sections[si],
                "pg-row",
                {
                  gridTemplateColumns: `${m.labelW}px ${m.colonW}px minmax(0,1fr)`,
                  fontSize: m.size * T.bs,
                  lineHeight: `${m.wrapLH * T.bs * T.ls}px`,
                  padding: `${((m.pitch - m.wrapLH) / 2) * T.bs * T.ls}px 0`,
                },
                true,
              )}
              {editing && (
                <button className="pg-btn pg-add" onClick={() => update((x) => void x.sections[si].rows.push(["Label", "Value"]))}>
                  + Row
                </button>
              )}
            </div>
          );
        })}
        {editing && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              className="pg-btn pg-add pg-lg"
              onClick={() => update((x) => void x.sections.push({ title: "NEW SECTION", style: "fam", rows: [["Label", "Value"]] }))}
            >
              + Section
            </button>
            <button
              className="pg-btn pg-lg"
              onClick={() => {
                if (confirm("Reset all text and photo to the original?")) update((x) => Object.assign(x, clone(DEFAULT_DOC)));
              }}
            >
              Reset to original
            </button>
          </div>
        )}
      </div>

      <Editable
        value={d.lppTitle}
        onChange={setText("lppTitle")}
        style={{
          position: "absolute",
          left: 332,
          top: 1214,
          width: 400,
          textAlign: "center",
          fontSize: "calc(28px * var(--hs))",
          lineHeight: "calc(36px * var(--hs) * var(--ls))",
          fontWeight: 700,
          fontStretch: "64%",
          color: head,
        }}
      />
      <Editable
        value={d.lpp}
        onChange={setText("lpp")}
        multiline
        style={{
          position: "absolute",
          left: 261,
          top: 1255,
          width: 537,
          fontSize: "calc(18.6px * var(--bs))",
          lineHeight: "calc(26.8px * var(--bs) * var(--ls))",
          textAlign: "justify",
          fontStretch: "70%",
          letterSpacing: 0,
        }}
      />
    </div>
  );
}

interface PhotoProps {
  doc: Doc;
  update: Props["update"];
  scale: number;
  onPick: () => void;
  onZoom: (dz: number) => void;
}

/** The oval inside the gold frame. Drag to pan, scroll to zoom, click to upload when empty. */
function Photo({ doc: d, update, scale, onPick, onZoom }: PhotoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ sx: number; sy: number; ox: number; oy: number; x: number; y: number } | null>(null);
  const has = d.photo !== null;

  // React's onWheel is passive, so preventDefault (to stop the page scrolling) needs a native listener.
  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;
  useEffect(() => {
    const el = ref.current;
    if (!el || !has) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current(e.deltaY < 0 ? 0.05 : -0.05);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [has]);

  const pos = drag ?? d.ph;
  const end = () => {
    if (!drag) return;
    setDrag(null);
    update((x) => {
      x.ph.x = drag.x;
      x.ph.y = drag.y;
    });
  };

  return (
    <div
      ref={ref}
      className="pg-photo"
      title={has ? "Drag to pan, scroll to zoom" : "Click to add photo"}
      style={{ cursor: has ? (drag ? "grabbing" : "grab") : "pointer", background: has ? "#efe2c4" : "transparent" }}
      onClick={() => !has && onPick()}
      onPointerDown={(e) => {
        if (!has) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ sx: e.clientX, sy: e.clientY, ox: d.ph.x, oy: d.ph.y, x: d.ph.x, y: d.ph.y });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        setDrag({ ...drag, x: drag.ox + (e.clientX - drag.sx) / scale, y: drag.oy + (e.clientY - drag.sy) / scale });
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {has && (
        <div
          className="pg-photo-img"
          style={{
            backgroundImage: `url("${d.photo}")`,
            transform: `translate(${pos.x}px,${pos.y}px) scale(${d.ph.z})`,
          }}
        />
      )}
    </div>
  );
}

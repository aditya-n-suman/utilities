import { clone, DEFAULT_DOC, pct, stepType, type Doc, type TypeScale } from "../doc";
import { FONTS, HEADING_COLORS, TEXT_COLORS, type FontName, type Settings } from "../settings";

interface Props {
  doc: Doc;
  update: (fn: (d: Doc) => void) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  onPickPhoto: () => void;
  onZoom: (dz: number) => void;
}

const TYPE_ROWS: [keyof TypeScale, string][] = [
  ["hs", "Heading size"],
  ["bs", "Body size"],
  ["ls", "Line spacing"],
  ["sg", "Section gap"],
];

/** Floating controls, top-left. With editing off only the toggle and Print remain. */
export default function Panel({ doc: d, update, settings, setSettings, onPickPhoto, onZoom }: Props) {
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  const pan = (dx: number, dy: number) =>
    update((x) => {
      x.ph.x += dx;
      x.ph.y += dy;
    });

  return (
    <div className="panel-wrap no-print">
      <div className="panel-bar">
        <button
          className={"pn-btn pn-toggle" + (settings.editing ? " on" : "")}
          aria-pressed={settings.editing}
          onClick={() => set({ editing: !settings.editing })}
        >
          {settings.editing ? "Done editing" : "Edit"}
        </button>
        <button className="pn-btn pn-text" onClick={() => window.print()} title="Print, or choose Save as PDF as the printer">
          Print / PDF
        </button>
      </div>

      {settings.editing && (
        <div className="panel">
          <div className="pn-group">
            <div className="pn-head">Text &amp; spacing</div>
            {TYPE_ROWS.map(([k, label]) => (
              <div key={k} className="pn-step">
                <div className="pn-label">{label}</div>
                <button className="pn-btn" onClick={() => update((x) => void (x.type = stepType(x.type, k, -1)))}>
                  −
                </button>
                <div className="pn-val">{pct(d.type[k])}</div>
                <button className="pn-btn" onClick={() => update((x) => void (x.type = stepType(x.type, k, 1)))}>
                  +
                </button>
              </div>
            ))}
            <button className="pn-btn pn-text pn-start" onClick={() => update((x) => void (x.type = clone(DEFAULT_DOC.type)))}>
              Reset text sizes
            </button>
          </div>

          <div className="pn-rule" />

          <div className="pn-group">
            <div className="pn-head">Photo</div>
            <button className="pn-btn pn-text" onClick={onPickPhoto}>
              {d.photo ? "Change photo" : "Upload photo"}
            </button>
            <div className="pn-step">
              <div className="pn-label">Zoom</div>
              <button className="pn-btn" onClick={() => onZoom(-0.1)}>
                −
              </button>
              <div className="pn-val">{pct(d.ph.z)}</div>
              <button className="pn-btn" onClick={() => onZoom(0.1)}>
                +
              </button>
            </div>
            <div className="pn-pan-row">
              <div className="pn-label">Pan</div>
              <div className="pn-pad">
                <div />
                <button className="pn-btn" aria-label="Move up" onClick={() => pan(0, -10)}>↑</button>
                <div />
                <button className="pn-btn" aria-label="Move left" onClick={() => pan(-10, 0)}>←</button>
                <button
                  className="pn-btn"
                  title="Center"
                  onClick={() =>
                    update((x) => {
                      x.ph.x = 0;
                      x.ph.y = 0;
                    })
                  }
                >
                  •
                </button>
                <button className="pn-btn" aria-label="Move right" onClick={() => pan(10, 0)}>→</button>
                <div />
                <button className="pn-btn" aria-label="Move down" onClick={() => pan(0, 10)}>↓</button>
                <div />
              </div>
            </div>
            <div className="pn-label pn-hint">Drag the photo to pan. Scroll on it to zoom.</div>
            <div className="pn-row-btns">
              <button className="pn-btn pn-text" onClick={() => update((x) => void (x.ph = clone(DEFAULT_DOC.ph)))}>
                Reset photo position
              </button>
              {d.photo && (
                <button className="pn-btn pn-text" onClick={() => update((x) => void (x.photo = null))}>
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="pn-rule" />

          <div className="pn-group">
            <div className="pn-head">Type</div>
            <label className="pn-step pn-field">
              <span className="pn-label">Font</span>
              <select className="pn-select" value={settings.font} onChange={(e) => set({ font: e.target.value as FontName })}>
                {Object.keys(FONTS).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <Swatches label="Heading colour" options={HEADING_COLORS} value={settings.headColor} onChange={(c) => set({ headColor: c })} />
            <Swatches label="Text colour" options={TEXT_COLORS} value={settings.textColor} onChange={(c) => set({ textColor: c })} />
          </div>
        </div>
      )}
    </div>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="pn-swatch-row">
      <div className="pn-label">{label}</div>
      <div className="pn-swatches">
        {options.map((c) => (
          <button
            key={c}
            className={"pn-swatch" + (c.toLowerCase() === value.toLowerCase() ? " on" : "")}
            style={{ background: c }}
            title={c}
            aria-label={`${label} ${c}`}
            onClick={() => onChange(c)}
          />
        ))}
        <input className="pn-color" type="color" value={value} aria-label={`Custom ${label.toLowerCase()}`} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

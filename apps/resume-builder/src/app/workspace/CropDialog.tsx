// Square crop for the photo, saved as a 600 × 600 JPEG so the draft stays
// small enough for browser storage. Drag to position, slider to zoom. The
// image is placed with physical left/top on purpose: it mirrors canvas maths.

import { useEffect, useRef, useState } from "react";

const VIEW = 280;
const OUT = 600;

export function CropDialog({ src, onCancel, onSave }: { src: string; onCancel: () => void; onSave: (dataUrl: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pan = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setFailed(true);
    i.src = src;
  }, [src]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);

  const s0 = img ? (VIEW / Math.min(img.naturalWidth, img.naturalHeight)) * z : 1;
  const dw = img ? img.naturalWidth * s0 : 0;
  const dh = img ? img.naturalHeight * s0 : 0;

  const save = () => {
    if (!img) return;
    const k = OUT / VIEW;
    const cv = document.createElement("canvas");
    cv.width = OUT;
    cv.height = OUT;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, (VIEW / 2 + pos.x - dw / 2) * k, (VIEW / 2 + pos.y - dh / 2) * k, dw * k, dh * k);
    onSave(cv.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div className="scrim">
      <div role="dialog" aria-modal="true" aria-labelledby="crop-title" className="dialog dialog-crop">
        <div id="crop-title" className="dialog-title">Crop photo</div>
        {failed ? (
          <div className="warn">This file couldn't be read as an image. Try a PNG, JPEG or WebP.</div>
        ) : (
          <div
            className="crop"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pan.current = { sx: e.clientX, sy: e.clientY, ...pos };
            }}
            onPointerMove={(e) => {
              if (pan.current) setPos({ x: pan.current.x + e.clientX - pan.current.sx, y: pan.current.y + e.clientY - pan.current.sy });
            }}
            onPointerUp={() => (pan.current = null)}
          >
            {img && <img src={src} alt="" draggable={false} style={{ left: VIEW / 2 + pos.x - dw / 2, top: VIEW / 2 + pos.y - dh / 2, width: dw, height: dh }} />}
            <div className="crop-ring" />
          </div>
        )}
        <label className="scale">
          <span>Zoom</span>
          <input type="range" min={1} max={3} step={0.01} value={z} onChange={(e) => setZ(+e.target.value)} />
        </label>
        <div className="f-help">Drag to position. Saved at 600 × 600 px so the draft fits in browser storage.</div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!img} onClick={save}>Use photo</button>
        </div>
      </div>
    </div>
  );
}

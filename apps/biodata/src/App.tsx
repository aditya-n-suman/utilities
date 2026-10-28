import { useCallback, useEffect, useRef, useState } from "react";
import Page, { PAGE_H, PAGE_W } from "./components/Page";
import Panel from "./components/Panel";
import { clone, DEFAULT_DOC, loadDoc, saveDoc, zoomBy, type Doc } from "./doc";
import { readPhoto } from "./photo";
import { loadSettings, saveSettings, type Settings } from "./settings";

const GUTTER = 16;

// Narrow windows get the whole page scaled down to fit; it never grows past its real size.
const fitScale = () => Math.min(1, (window.innerWidth - GUTTER * 2) / PAGE_W);

export default function App() {
  const [doc, setDoc] = useState<Doc>(loadDoc);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [scale, setScale] = useState(fitScale);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveDoc(doc), [doc]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const update = useCallback((fn: (d: Doc) => void) => {
    setDoc((prev) => {
      const d = clone(prev);
      fn(d);
      return d;
    });
  }, []);
  const onZoom = useCallback((dz: number) => update((x) => void (x.ph = zoomBy(x.ph, dz))), [update]);
  const pickPhoto = () => fileRef.current?.click();

  return (
    <>
      <Panel doc={doc} update={update} settings={settings} setSettings={setSettings} onPickPhoto={pickPhoto} onZoom={onZoom} />
      <div className="stage" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
        <div className="stage-inner" style={{ transform: scale < 1 ? `scale(${scale})` : undefined }}>
          <Page doc={doc} update={update} settings={settings} scale={scale} onPickPhoto={pickPhoto} onZoom={onZoom} />
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const photo = await readPhoto(f);
            update((x) => {
              x.photo = photo;
              x.ph = clone(DEFAULT_DOC.ph);
            });
          } catch {
            alert("That file couldn't be read as an image.");
          }
        }}
      />
    </>
  );
}

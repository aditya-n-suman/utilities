// Chrome's built-in AI translation (Translator and LanguageDetector, Chrome 138+). They are window APIs, so they run
// here in the content script, not in the background. Firefox and some Chromium browsers don't have them (or report
// models they can't download, like Brave), which callers treat as "not available" and go online if allowed.
import type { Translate } from "@/engine/lyrics/pipeline";

type Availability = "unavailable" | "downloadable" | "downloading" | "available";
interface Monitor {
  addEventListener(type: "downloadprogress", cb: (e: { loaded: number }) => void): void;
}
interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: Monitor) => void }): Promise<{
    translate(text: string): Promise<string>;
  }>;
}
interface DetectorApi {
  availability(): Promise<Availability>;
  create(o?: { monitor?: (m: Monitor) => void }): Promise<{
    detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
  }>;
}

const api = <T>(name: string): T | null => ((globalThis as Record<string, unknown>)[name] as T | undefined) ?? null;

/** Model downloads need a recent click; without one Chrome refuses. */
const hasClick = () => (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? false;

// A model that stops reporting download progress for this long counts as unavailable, e.g. a browser that lists
// the API but can't fetch Google's models.
const STALL_MS = 20_000;

function createWithStallTimeout<T>(start: (onProgress: (f: number) => void) => Promise<T>, onProgress: (f: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer = setTimeout(() => reject(new Error("model download stalled")), STALL_MS);
    start((f) => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(new Error("model download stalled")), STALL_MS);
      onProgress(f);
    }).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const translators = new Map<string, Translate>();

export async function onDeviceTranslator(source: string, target: string, onProgress: (f: number) => void): Promise<Translate | "needs-click" | null> {
  const key = `${source}>${target}`;
  const ready = translators.get(key);
  if (ready) return ready;
  const Translator = api<TranslatorApi>("Translator");
  if (!Translator) return null;
  const pair = { sourceLanguage: source, targetLanguage: target };
  const availability = await Translator.availability(pair).catch(() => "unavailable" as const);
  if (availability === "unavailable") return null;
  if (availability !== "available" && !hasClick()) return "needs-click";
  try {
    const t = await createWithStallTimeout(
      (progress) => Translator.create({ ...pair, monitor: (m) => m.addEventListener("downloadprogress", (e) => progress(e.loaded)) }),
      onProgress,
    );
    const translate: Translate = (line) => t.translate(line);
    translators.set(key, translate);
    return translate;
  } catch {
    return null;
  }
}

let detector: Awaited<ReturnType<DetectorApi["create"]>> | null = null;

/** The most likely language, or null when there is no detector or it isn't confident. */
export async function detectOnDevice(text: string): Promise<string | null> {
  const LanguageDetector = api<DetectorApi>("LanguageDetector");
  if (!LanguageDetector) return null;
  if (!detector) {
    const availability = await LanguageDetector.availability().catch(() => "unavailable" as const);
    if (availability === "unavailable" || (availability !== "available" && !hasClick())) return null;
    try {
      detector = await createWithStallTimeout((progress) => LanguageDetector.create({ monitor: (m) => m.addEventListener("downloadprogress", (e) => progress(e.loaded)) }), () => {});
    } catch {
      return null;
    }
  }
  const [top] = await detector.detect(text);
  return top && top.detectedLanguage !== "und" && top.confidence >= 0.5 ? top.detectedLanguage : null;
}

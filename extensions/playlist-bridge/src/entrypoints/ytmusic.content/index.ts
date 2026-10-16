// Lyrics bar on music.youtube.com: Off · Translate · Transliterate · Both, with the extra lines shown under each
// original line. YouTube's own lyrics element is never edited (its framework would overwrite changes): while a
// mode is on it is hidden, and our copy is drawn just before it, in a shadow root, with its font and colours.
// Only static lyrics (one text block in ytmusic-description-shelf-renderer) are handled; synced lyrics come later.
// YouTube Music is a single-page app, so a cheap poll plus an observer on the lyrics text follow song changes.
import css from "./lyrics.css?inline";
import { onlineLine, nativeLine } from "@/engine/lyrics/messages";
import { MODES, runLyrics, type Deps, type LineResult, type Mode, type Status } from "@/engine/lyrics/pipeline";
import { isRtl, lineKey, splitLines } from "@/engine/lyrics/text";
import { loadLyricsSettings, saveLyricsSettings } from "@/platform/lyricsSettings";
import { detectOnDevice, onDeviceTranslator } from "./ondevice";

const TARGET = "en";
const LABELS: Record<Mode, string> = { off: "Off", translate: "Translate", transliterate: "Transliterate", both: "Both" };
const HIDDEN_ATTR = "data-playlist-bridge-hidden";
// Styles copied from YouTube's lyrics so ours look the same. Alignment isn't copied: each line follows its script.
const COPIED = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color"];

/**
 * YouTube's lyrics text. Scoped to the player page: artist pages use the same element for their bio. The player
 * page can hold several of these shelves (other tabs keep theirs, hidden), so prefer one that's on screen and has
 * the lyrics "Source: …" footer.
 */
function findLyrics(): HTMLElement | null {
  const shelves = [...document.querySelectorAll<HTMLElement>("ytmusic-player-page ytmusic-description-shelf-renderer")];
  const visible = (e: Element) => e.getClientRects().length > 0;
  const lyricsFooter = (s: Element) => /^\s*source\s*:/i.test(s.querySelector(".footer")?.textContent ?? "");
  const shelf =
    shelves.find((s) => visible(s) && lyricsFooter(s)) ?? shelves.find(visible) ?? shelves.find(lyricsFooter) ?? shelves[0];
  return shelf?.querySelector<HTMLElement>(".description") ?? null;
}

const deps: Deps = {
  online: (line) => onlineLine(line, TARGET),
  native: nativeLine,
  detect: detectOnDevice,
  translator: (source, onProgress) => onDeviceTranslator(source, TARGET, onProgress),
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export default defineContentScript({
  matches: ["https://music.youtube.com/*"],
  async main(ctx) {
    let settings = await loadLyricsSettings();

    const pageStyle = el("style");
    pageStyle.textContent = `[${HIDDEN_ATTR}]{display:none !important}`;
    document.head.append(pageStyle);

    const host = el("div", "playlist-bridge-lyrics");
    const root = host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = css;
    const bar = el("div", "bar");
    const mark = el("span", "mark");
    mark.setAttribute("aria-hidden", "true");
    mark.append(el("i", "g"), el("i", "l"), el("i", "r"));
    const modes = el("div", "modes");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "Lyrics translation (Playlist Bridge)");
    const modeButtons = MODES.map((mode) => {
      const b = el("button", "", LABELS[mode]);
      b.type = "button";
      b.addEventListener("click", () => setMode(mode));
      modes.append(b);
      return [mode, b] as const;
    });
    const statusText = el("span", "status");
    statusText.setAttribute("role", "status");
    const statusAction = el("button", "link");
    statusAction.type = "button";
    statusAction.hidden = true;
    bar.append(mark, modes, statusText, statusAction);
    const notice = el("div", "notice");
    notice.hidden = true;
    const lyrics = el("div", "lyrics");
    root.append(style, bar, notice, lyrics);

    let desc: HTMLElement | null = null;
    let descObserver: MutationObserver | null = null;
    let text: string | null = null;
    let run: AbortController | null = null;
    let rows = new Map<string, HTMLElement[]>();

    const action = (label: string, onClick: (() => void) | null) => {
      statusAction.hidden = !onClick;
      statusAction.textContent = label;
      statusAction.onclick = onClick;
    };

    const showNotice = (message: string, buttons: [string, "primary" | "secondary", () => void][]) => {
      notice.replaceChildren();
      const p = el("p", "", message);
      const actions = el("div", "actions");
      for (const [label, kind, onClick] of buttons) {
        const b = el("button", kind, label);
        b.type = "button";
        b.addEventListener("click", onClick);
        actions.append(b);
      }
      notice.append(p, actions);
      notice.hidden = false;
    };

    const onStatus = (s: Status) => {
      notice.hidden = true;
      statusText.textContent = s.kind === "needs-online" || s.kind === "needs-click" ? "" : s.text;
      action("", null);
      if (s.kind === "done" && s.online) action("Stop using Google online", () => void setOnline(false));
      if (s.kind === "error") action("Retry", start);
      if (s.kind === "needs-online") {
        showNotice(`${s.text} It sends these lyrics to Google.`, [
          ["Allow Google Translate online", "primary", () => void setOnline(true)],
          ["Not now", "secondary", () => setMode("off")],
        ]);
      }
      if (s.kind === "needs-click") showNotice(s.text, [["Download", "primary", start]]);
    };

    const onLine = (key: string, r: LineResult) => {
      for (const row of rows.get(key) ?? []) {
        const [tr, tl] = [row.querySelector<HTMLElement>(".tr")!, row.querySelector<HTMLElement>(".tl")!];
        tr.textContent = r.translation ?? "";
        tr.hidden = !r.translation;
        tl.textContent = r.transliteration ?? "";
        tl.hidden = !r.transliteration;
        row.classList.toggle("extra", !!(r.translation || r.transliteration));
      }
    };

    /** Draws the original lines with empty slots for their extra lines. */
    const drawLines = () => {
      rows = new Map();
      lyrics.replaceChildren();
      for (const line of splitLines(text ?? "")) {
        const key = lineKey(line);
        if (!key) {
          lyrics.append(el("div", "gap", "​")); // keeps a blank line's height
          continue;
        }
        const row = el("div", isRtl(line) ? "line rtl" : "line");
        const orig = el("div", "orig", line);
        orig.dir = isRtl(line) ? "rtl" : "auto";
        const tr = el("div", "tr");
        const tl = el("div", "tl");
        tr.dir = tl.dir = "ltr";
        tr.hidden = tl.hidden = true;
        row.append(orig, tr, tl);
        lyrics.append(row);
        rows.set(key, [...(rows.get(key) ?? []), row]);
      }
    };

    function render() {
      for (const [mode, b] of modeButtons) b.setAttribute("aria-pressed", String(mode === settings.mode));
      const on = settings.mode !== "off";
      lyrics.hidden = !on;
      if (desc) desc.toggleAttribute(HIDDEN_ATTR, on);
    }

    function start() {
      run?.abort();
      run = new AbortController();
      render();
      notice.hidden = true;
      statusText.textContent = "";
      action("", null);
      if (settings.mode === "off" || text === null) return;
      drawLines();
      void runLyrics(splitLines(text), deps, {
        mode: settings.mode,
        onlineAllowed: settings.online,
        target: TARGET,
        signal: run.signal,
        onLine,
        onStatus,
      }).catch((e: unknown) => onStatus({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong." }));
    }

    function setMode(mode: Mode) {
      settings = { ...settings, mode };
      void saveLyricsSettings(settings);
      start();
    }

    async function setOnline(online: boolean) {
      settings = { ...settings, online };
      await saveLyricsSettings(settings);
      start();
    }

    /** Finds YouTube's lyrics, places our block before them and restarts when the song (the text) changes. */
    function sync() {
      const found = findLyrics();
      if (found !== desc) {
        descObserver?.disconnect();
        desc?.removeAttribute(HIDDEN_ATTR);
        desc = found;
        if (desc) {
          console.info("[Playlist Bridge] lyrics bar attached");
          descObserver = new MutationObserver(sync);
          descObserver.observe(desc, { childList: true, characterData: true, subtree: true });
        }
      }
      if (!desc) {
        if (text !== null) {
          run?.abort();
          text = null;
        }
        return;
      }
      if (host.nextElementSibling !== desc) desc.before(host);
      const computed = getComputedStyle(desc);
      for (const prop of COPIED) lyrics.style.setProperty(prop, computed.getPropertyValue(prop));
      const current = desc.textContent ?? "";
      if (current !== text) {
        text = current;
        start();
      } else render();
    }

    // Settings changed in another tab (e.g. the mode, or online turned off).
    const onStorage = (changes: Record<string, unknown>, area: string) => {
      if (area !== "local" || !("pb-lyrics" in changes)) return;
      void loadLyricsSettings().then((s) => {
        if (s.mode === settings.mode && s.online === settings.online) return;
        settings = s;
        start();
      });
    };
    browser.storage.onChanged.addListener(onStorage);

    console.info("[Playlist Bridge] lyrics bar ready, waiting for the Lyrics tab");
    ctx.setInterval(sync, 1000);
    ctx.onInvalidated(() => {
      run?.abort();
      descObserver?.disconnect();
      desc?.removeAttribute(HIDDEN_ATTR);
      host.remove();
      pageStyle.remove();
      browser.storage.onChanged.removeListener(onStorage);
    });
    sync();
  },
});

// Opens the app tab from the toolbar button, the right-click menu and the Spotify page button.
// No tabs permission: an already-open app tab claims the request by answering a message.
// Also makes the online lyrics requests for the YouTube Music lyrics bar (ytmusic.content), so they come from the
// extension and are cached in its storage, not YouTube's.
import { cached } from "@/engine/lyrics/cache";
import { googleNativeScript, googleTranslate } from "@/engine/lyrics/google";
import type { LyricsRequest, LyricsResponse } from "@/engine/lyrics/messages";

const SPOTIFY_PLAYLIST_PATTERNS = ["https://open.spotify.com/*playlist/*"];

type OpenRequest = { url?: string; name?: string };

function lyricsRequest(m: LyricsRequest): Promise<unknown> {
  return m.type === "pb:lyrics-online"
    ? cached(`online|${m.target}|${m.text}`, () => googleTranslate(m.text, m.target))
    : cached(`native|${m.lang}|${m.text}`, () => googleNativeScript(m.text, m.lang));
}

async function openApp(request: OpenRequest = {}) {
  try {
    const handled = await browser.runtime.sendMessage({ type: "pb:open", ...request });
    if (handled === true) return;
  } catch {
    // no app tab is listening
  }
  const params = new URLSearchParams();
  if (request.url) params.set("url", request.url);
  if (request.name) params.set("name", request.name);
  const query = params.toString();
  await browser.tabs.create({ url: browser.runtime.getURL(`/app.html${query ? `?${query}` : ""}`) });
}

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => void openApp());

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "pb-convert-link",
      title: "Convert with Playlist Bridge",
      contexts: ["link"],
      targetUrlPatterns: SPOTIFY_PLAYLIST_PATTERNS,
    });
    browser.contextMenus.create({
      id: "pb-convert-page",
      title: "Convert with Playlist Bridge",
      contexts: ["page"],
      documentUrlPatterns: SPOTIFY_PLAYLIST_PATTERNS,
    });
  });

  browser.contextMenus.onClicked.addListener((info) => {
    const url = info.linkUrl ?? info.pageUrl;
    if (url) void openApp({ url });
  });

  // From the button on Spotify playlist pages, and the lyrics bar on YouTube Music (content scripts).
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const m = message as { type?: string; url?: string; name?: string };
    if (m?.type === "pb:convert" && sender.tab && m.url) void openApp({ url: m.url, name: m.name });
    if (m?.type === "pb:lyrics-online" || m?.type === "pb:lyrics-native") {
      lyricsRequest(m as LyricsRequest).then(
        (value) => sendResponse({ ok: true, value } satisfies LyricsResponse),
        (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies LyricsResponse),
      );
      return true; // answers asynchronously
    }
    return undefined;
  });
});

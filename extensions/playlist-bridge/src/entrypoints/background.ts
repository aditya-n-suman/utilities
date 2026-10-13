// Opens the app tab from the toolbar button, the right-click menu and the Spotify page button.
// No tabs permission: an already-open app tab claims the request by answering a message.

const SPOTIFY_PLAYLIST_PATTERNS = ["https://open.spotify.com/*playlist/*"];

type OpenRequest = { url?: string; name?: string };

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

  // From the button on Spotify playlist pages (content script).
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const m = message as { type?: string; url?: string; name?: string };
    if (m?.type === "pb:convert" && sender.tab && m.url) void openApp({ url: m.url, name: m.name });
  });
});

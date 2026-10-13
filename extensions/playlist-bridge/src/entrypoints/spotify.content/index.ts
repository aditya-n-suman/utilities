// "Convert to YouTube" button on open.spotify.com playlist pages (design: "07 Spotify page button").
// Rendered in a shadow root so Spotify's styles and ours can't affect each other. Spotify is a
// single-page app, so a DOM observer re-attaches the button after in-app navigation.
import "./button.css";

const PLAYLIST_PATH = /^\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{22})/;
// Next to play / more in the action group; the whole row is the fallback.
const findAnchor = () =>
  document.querySelector('[data-testid="action-bar-row-actions"]') ?? document.querySelector('[data-testid="action-bar-row"]');

export default defineContentScript({
  matches: ["https://open.spotify.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    let ui: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let mountedFor: string | null = null;
    let mounting = false; // our own DOM changes re-trigger the observer; don't mount twice

    const playlistName = () =>
      document.querySelector('[data-testid="entityTitle"]')?.textContent?.trim() ||
      document.title.replace(/\s*\|\s*Spotify.*$/i, "").replace(/\s*-\s*playlist by.*$/i, "").trim() ||
      undefined;

    const sync = async () => {
      if (mounting) return;
      const id = location.pathname.match(PLAYLIST_PATH)?.[1] ?? null;
      const anchor = id ? findAnchor() : null;
      if (id && anchor && mountedFor === id && ui?.shadowHost.isConnected) return;
      ui?.remove();
      ui = null;
      mountedFor = null;
      if (!id || !anchor) return;

      mounting = true;
      mountedFor = id;
      ui = await createShadowRootUi(ctx, {
        name: "playlist-bridge-button",
        position: "inline",
        anchor,
        append: "last",
        onMount(container) {
          const wrap = document.createElement("div");
          wrap.className = "pb-wrap";
          const tip = document.createElement("span");
          tip.className = "pb-tip";
          tip.id = "pb-tip";
          tip.setAttribute("role", "tooltip");
          tip.textContent = "Open in Playlist Bridge";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "pb-button";
          button.setAttribute("aria-describedby", "pb-tip");
          button.innerHTML =
            '<span class="pb-mark" aria-hidden="true"><span class="pb-dot g"></span><span class="pb-line"></span><span class="pb-dot r"></span></span><span>Convert to YouTube</span>';
          button.addEventListener("click", () => {
            void browser.runtime.sendMessage({
              type: "pb:convert",
              url: `https://open.spotify.com/playlist/${id}`,
              name: playlistName(),
            });
          });
          wrap.append(tip, button);
          container.append(wrap);
        },
      });
      ui.mount();
      mounting = false;
    };

    const observer = new MutationObserver(() => void sync());
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());
    void sync();
  },
});

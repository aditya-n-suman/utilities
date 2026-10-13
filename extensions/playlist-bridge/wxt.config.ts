import { defineConfig } from "wxt";

// Sites the engine talks to. Listed once here and in src/platform/access.ts (shown to users).
export const HOSTS = [
  "https://open.spotify.com/*",
  "https://api-partner.spotify.com/*",
  "https://open.spotifycdn.com/*",
  "https://music.youtube.com/*",
  "https://www.youtube.com/*",
];

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "Playlist Bridge",
    description: "Turn a Spotify playlist into a YouTube playlist. Runs entirely in your browser.",
    permissions: ["declarativeNetRequestWithHostAccess", "cookies", "contextMenus", "storage"],
    host_permissions: HOSTS,
    icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
    action: {
      default_title: "Open Playlist Bridge",
      default_icon: { 16: "icons/16.png", 32: "icons/32.png" },
      ...(browser === "firefox"
        ? {
            // Firefox picks the variant that contrasts with the toolbar theme.
            theme_icons: [
              { light: "icons/dark-16.png", dark: "icons/16.png", size: 16 },
              { light: "icons/dark-32.png", dark: "icons/32.png", size: 32 },
            ],
          }
        : {}),
    },
    declarative_net_request: {
      rule_resources: [{ id: "youtube_headers", enabled: true, path: "rules/youtube-headers.json" }],
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "playlist-bridge@utilities.aditya-n-suman",
              strict_min_version: "142.0",
              // Nothing is collected or sent anywhere except Spotify and YouTube.
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});

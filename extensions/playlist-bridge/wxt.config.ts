import { defineConfig } from "wxt";

// Sites the engine talks to. Listed once here and in src/platform/access.ts (shown to users).
export const HOSTS = [
  "https://open.spotify.com/*",
  "https://api-partner.spotify.com/*",
  "https://open.spotifycdn.com/*",
  "https://music.youtube.com/*",
  "https://www.youtube.com/*",
];

// Chrome derives an unpacked extension's ID from its folder path unless the manifest has a `key`. A fixed key keeps the
// ID (and with it IndexedDB, storage and site access) the same wherever users unzip a release.
// ID: eajdiknjbchmmmcdocfcoapelklimgff. Public key only; see SETUP.md → Extension ID.
const CHROME_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq+7HwVUXBfQ9yGbVY2Jfo1o6LOIUGu2emnU4ZAct74JCQyUC72G6ysjzWqGYoKmsHl3UR4wqE3OUruUz5R4/wwaBXcppkVhf/MVgPS5SYZa9txmcSnjOeeUJdMucUHbEPybMgv/APmmwbebE4lAfwuOQ61YAshA9/HIMeHmZUlRbslQoH+VtkrJSWmq3eLfF/1/eu93tdTdyYEVsZQ0O/XE5p/JzBjtzsa7LMbozCla9mAcqOzGlqOzgc17C604Jby+OOJg8Q1i6XSuFhh3fU2PbYvSKXUfcSNK6HG4OTsIbJxCFLmXN8nMWWxwRFi9og4KAp1UUIOtlEyaY4Xxg+wIDAQAB";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "Playlist Bridge",
    ...(browser === "firefox" ? {} : { key: CHROME_KEY }),
    description: "Turn a Spotify playlist into a YouTube playlist. Runs entirely in your browser.",
    permissions: ["declarativeNetRequestWithHostAccess", "cookies", "contextMenus", "storage"],
    host_permissions: HOSTS,
    // Only needed to follow spotify.link / spoti.fi short links; requested when one is pasted.
    optional_host_permissions: ["https://spotify.link/*", "https://spoti.fi/*"],
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

import { browser } from "wxt/browser";

const REPO = "https://github.com/aditya-n-suman/utilities";

export const version = () => browser.runtime.getManifest().version;

export const helpUrl = () => browser.runtime.getURL("/help.html");

/** Pre-filled GitHub issue with version and browser, so reports are actionable. */
export function reportProblemUrl(): string {
  const body = [
    "**What happened?**",
    "",
    "**What did you expect?**",
    "",
    "**Playlist link (if it's public):**",
    "",
    "---",
    `Playlist Bridge extension ${version()}`,
    `Browser: ${navigator.userAgent}`,
  ].join("\n");
  const params = new URLSearchParams({ title: "[Playlist Bridge extension] ", body, labels: "playlist-bridge-extension" });
  return `${REPO}/issues/new?${params}`;
}

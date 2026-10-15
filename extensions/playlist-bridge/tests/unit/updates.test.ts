import { describe, expect, it } from "vitest";
import { isNewer, pickLatest } from "@/platform/updates";

const rel = (tag: string, extra: object = {}) => ({ tag_name: tag, html_url: `https://github.com/x/releases/tag/${tag}`, ...extra });

describe("isNewer", () => {
  it("compares numerically, not as text", () => {
    expect(isNewer("1.10.0", "1.9.0")).toBe(true);
    expect(isNewer("2.0.0", "1.99.99")).toBe(true);
    expect(isNewer("1.0.1", "1.0.0")).toBe(true);
  });
  it("is false for equal, older or unparseable versions", () => {
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
    expect(isNewer("0.9.0", "1.0.0")).toBe(false);
    expect(isNewer("1.1", "1.0.0")).toBe(false);
    expect(isNewer("1.1.0-beta", "1.0.0")).toBe(false);
  });
});

describe("pickLatest", () => {
  it("picks the highest playlist-bridge release regardless of order", () => {
    const latest = pickLatest([rel("playlist-bridge-v1.2.0"), rel("playlist-bridge-v1.10.0"), rel("playlist-bridge-v1.3.0")]);
    expect(latest?.version).toBe("1.10.0");
    expect(latest?.url).toContain("playlist-bridge-v1.10.0");
  });
  it("ignores other utilities, drafts, prereleases and odd tags", () => {
    expect(
      pickLatest([
        rel("nginx-config-explorer-v9.0.0"),
        rel("v9.0.0"),
        rel("playlist-bridge-v9.0.0", { draft: true }),
        rel("playlist-bridge-v8.0.0", { prerelease: true }),
        rel("playlist-bridge-v7.0"),
        rel("playlist-bridge-v1.1.0"),
      ]),
    ).toEqual({ version: "1.1.0", url: "https://github.com/x/releases/tag/playlist-bridge-v1.1.0" });
  });
  it("returns null when there is no release", () => {
    expect(pickLatest([])).toBeNull();
  });
});

// Builds the release files into .output/ and writes SHA256SUMS.txt for them.
//   node scripts/release.mjs        (also run by .github/workflows/playlist-bridge-release.yml)
// Users get the Chrome zip; the Firefox zip + sources zip are only for AMO unlisted signing.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, ".output");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });
run("npx wxt zip");
run("npx wxt zip -b firefox --mv3");

const files = [
  `playlist-bridge-extension-${version}-chrome.zip`,
  `playlist-bridge-extension-${version}-firefox.zip`,
  `playlist-bridge-extension-${version}-sources.zip`,
];
const sums = files.map((f) => `${createHash("sha256").update(readFileSync(join(out, f))).digest("hex")}  ${f}`);
writeFileSync(join(out, "SHA256SUMS.txt"), sums.join("\n") + "\n");

console.log(`\nRelease ${version} in .output/:\n${sums.join("\n")}`);

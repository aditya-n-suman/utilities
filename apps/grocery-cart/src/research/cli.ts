// Small helpers shared by the Phase 0 command-line scripts.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** True when the module is the script being run (not imported by a test). */
export function isMain(moduleUrl: string): boolean {
  return !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === moduleUrl;
}

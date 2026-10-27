// The on-disk capture format shared by record, summarize and probe.
//   captures/<site>-<stamp>/raw.jsonl   one CapturedRequest per line (has cookies and auth headers: local only)
//   captures/<site>-<stamp>/steps.json  StepMark[] (what you did when, and the words you typed)
//   captures/<site>-<stamp>/summary.md  redacted, safe to share

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface CapturedRequest {
  seq: number;
  /** ms since recording started, when the request was sent */
  t: number;
  step: string;
  method: string;
  url: string;
  resourceType: string;
  /** false: another host; headers and bodies are kept only if the request carried the search term */
  siteHost: boolean;
  reqHeaders?: Record<string, string>;
  reqBody?: string;
  status?: number;
  resHeaders?: Record<string, string>;
  resBody?: string;
  /** set when the body wasn't kept (binary or too large) */
  resBodyNote?: string;
  failure?: string;
}

export interface StepMark {
  step: string;
  t: number;
  /** search term, product name, etc., typed in the terminal */
  data?: Record<string, string>;
}

export interface Capture {
  dir: string;
  site: string;
  requests: CapturedRequest[];
  steps: StepMark[];
}

export function loadCapture(dir: string): Capture {
  const requests = readFileSync(join(dir, "raw.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CapturedRequest);
  const steps = JSON.parse(readFileSync(join(dir, "steps.json"), "utf8")) as StepMark[];
  const site = (dir.split(/[\\/]/).pop() ?? "").split("-")[0];
  return { dir, site, requests, steps };
}

/** Newest captures/<site>-* directory. */
export function latestCaptureDir(root: string, site: string): string {
  const dirs = readdirSync(root)
    .filter((d) => d.startsWith(`${site}-`))
    .map((d) => join(root, d))
    .filter((d) => statSync(d).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!dirs.length) throw new Error(`No ${site} capture in ${root}. Run the recorder first.`);
  return dirs[0];
}

/** The value typed for a step (e.g. stepData(c, "search", "term")). */
export function stepData(c: Capture, step: string, key: string): string | undefined {
  return c.steps.find((s) => s.step === step)?.data?.[key];
}

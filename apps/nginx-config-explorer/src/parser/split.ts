import type { Dump, SourceFile, TestStatus } from "./types";

const HEADER = /^# configuration file (.+):\s*$/;
const STATUS = /^nginx: /;

/**
 * Split `nginx -T` output into its files.
 *
 * nginx prints the `nginx -t` result lines, then each loaded file preceded by
 * `# configuration file <path>:`. Text without any header (a plain nginx.conf)
 * becomes one file named `fallbackName`.
 */
export function splitDump(input: string, fallbackName = "nginx.conf"): Dump {
  const lines = input.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const statusLines: string[] = [];
  const files: SourceFile[] = [];
  let current: { path: string; lines: string[]; dumpLine: number } | null = null;
  const flush = () => {
    if (current) files.push(toFile(current.path, current.lines, current.dumpLine));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = HEADER.exec(line);
    if (header) {
      flush();
      current = { path: header[1].trim(), lines: [], dumpLine: i + 2 };
      continue;
    }
    if (!current) {
      if (STATUS.test(line)) statusLines.push(line);
      continue;
    }
    current.lines.push(line);
  }
  flush();

  if (files.length === 0) {
    // No headers: treat everything except the status lines as one config file.
    const body: string[] = [];
    let first = 0;
    while (first < lines.length && STATUS.test(lines[first])) first++;
    for (let i = first; i < lines.length; i++) body.push(lines[i]);
    if (body.some((l) => l.trim() !== "")) files.push(toFile(fallbackName, body, first + 1));
  }

  return { statusLines, status: testStatus(statusLines), files };
}

function toFile(path: string, lines: string[], dumpLine: number): SourceFile {
  // nginx separates files with a blank line; drop trailing blanks so line counts match the file.
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  return { path, text: lines.slice(0, end).join("\n"), dumpLine };
}

function testStatus(statusLines: string[]): TestStatus {
  if (statusLines.some((l) => /test failed|\[emerg\]/.test(l))) return "failed";
  if (statusLines.some((l) => /test is successful/.test(l))) return "ok";
  return "unknown";
}

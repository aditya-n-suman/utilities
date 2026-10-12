/** One config file as nginx -T printed it. `lines` are the file's own lines (line 1 = first line after its header). */
export interface SourceFile {
  path: string;
  text: string;
  /** Line in the uploaded dump where this file's first line sits (1-based). */
  dumpLine: number;
}

export type TestStatus = "ok" | "failed" | "unknown";

export interface Dump {
  /** The "nginx: …" lines printed before the first file. */
  statusLines: string[];
  status: TestStatus;
  files: SourceFile[];
}

/** A node straight from the parser, before includes are resolved. */
export interface ParsedNode {
  type: "directive" | "block" | "comment" | "raw";
  /** Directive or block name (`server`, `listen`). Empty for comments and raw lines. */
  name: string;
  /** Arguments as written, quotes kept (`"public, immutable"`). */
  args: string[];
  /** Comment text including the leading `#`, or a raw (Lua) line. */
  text: string;
  /** A `# comment` on the same line, after the `;` or `{`. */
  trailing?: string;
  line: number;
  file: string;
  children: ParsedNode[];
}

export interface ParseWarning {
  file: string;
  line: number;
  message: string;
}

export interface ParsedFile {
  path: string;
  nodes: ParsedNode[];
  warnings: ParseWarning[];
  lineCount: number;
}

export type ViewKind = "directive" | "block" | "comment" | "raw" | "include" | "file";

/** A node as the explorer shows it: ids are unique per view, includes may hold the files they pull in. */
export interface ViewNode {
  id: string;
  kind: ViewKind;
  name: string;
  args: string[];
  text: string;
  trailing?: string;
  line: number;
  file: string;
  /** Name of the enclosing block (`upstream`, `http`…), "" at top level. */
  parentName: string;
  children: ViewNode[];
  /** include only: the pattern matched no file in the dump. */
  missing?: boolean;
  /** file only: why this file is shown (merged view). */
  note?: "included" | "unreached" | "cycle";
}

export type ViewMode = "merged" | "files";

import { parseFile } from "./parse";
import type { Dump, ParsedFile, ParsedNode, ParseWarning, ViewMode, ViewNode } from "./types";

export interface Model {
  dump: Dump;
  parsed: ParsedFile[];
  warnings: ParseWarning[];
  /** Directory relative include paths resolve against (the main config's folder). */
  prefix: string;
  trees: Record<ViewMode, ViewNode[]>;
  totalLines: number;
}

export function buildModel(dump: Dump): Model {
  const parsed = dump.files.map((f) => parseFile(f.path, f.text));
  const prefix = prefixOf(dump.files[0]?.path ?? "");
  return {
    dump,
    parsed,
    warnings: parsed.flatMap((p) => p.warnings),
    prefix,
    trees: { merged: buildMerged(parsed, prefix), files: buildByFile(parsed) },
    totalLines: parsed.reduce((s, p) => s + p.lineCount, 0),
  };
}

/** `/etc/nginx/nginx.conf` → `/etc/nginx/`. A relative or bare name has no prefix. */
export function prefixOf(path: string): string {
  const k = path.lastIndexOf("/");
  return k >= 0 ? path.slice(0, k + 1) : "";
}

/** nginx include pattern (glob(3): `*`, `?`, `[…]`) → matcher for absolute paths. */
export function includeMatcher(pattern: string, prefix: string): (path: string) => boolean {
  const unquoted = pattern.replace(/^(["'])(.*)\1$/, "$2");
  const full = unquoted.startsWith("/") ? unquoted : prefix + unquoted;
  if (!/[*?[]/.test(full)) return (p) => p === full;
  let re = "";
  for (let i = 0; i < full.length; i++) {
    const c = full[i];
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const close = full.indexOf("]", i + 1);
      if (close < 0) re += "\\[";
      else {
        re += "[" + full.slice(i + 1, close).replace(/^!/, "^").replace(/\\/g, "\\\\") + "]";
        i = close;
      }
    } else re += c.replace(/[.+^${}()|\\/]/g, "\\$&");
  }
  const rx = new RegExp("^" + re + "$");
  return (p) => rx.test(p);
}

function convert(nodes: ParsedNode[], parentId: string, parentName: string, expandInclude?: IncludeExpander): ViewNode[] {
  return nodes.map((n, i) => {
    const id = `${parentId}.${i}`;
    const v: ViewNode = {
      id,
      kind: n.type,
      name: n.name,
      args: n.args,
      text: n.text,
      trailing: n.trailing,
      line: n.line,
      file: n.file,
      parentName,
      children: [],
    };
    if (n.type === "block") v.children = convert(n.children, id, n.name, expandInclude);
    if (expandInclude && n.type === "directive" && n.name === "include") {
      v.kind = "include";
      v.children = expandInclude(n.args[0] ?? "", id, parentName);
      v.missing = v.children.length === 0;
    }
    return v;
  });
}

type IncludeExpander = (pattern: string, id: string, parentName: string) => ViewNode[];

function fileNode(id: string, p: ParsedFile, children: ViewNode[], note?: ViewNode["note"]): ViewNode {
  return { id, kind: "file", name: p.path, args: [], text: "", line: 0, file: p.path, parentName: "", children, note };
}

/** One top-level node per file, in dump order. Includes stay plain directives. */
export function buildByFile(parsed: ParsedFile[]): ViewNode[] {
  return parsed.map((p, k) => fileNode(`f${k}`, p, convert(p.nodes, `f${k}`, "")));
}

/**
 * The main config with every include replaced by the files it matches, where nginx reads them.
 * Files the main config never reaches are appended at the end so nothing in the dump is hidden.
 */
export function buildMerged(parsed: ParsedFile[], prefix: string): ViewNode[] {
  if (parsed.length === 0) return [];
  const reached = new Set<string>([parsed[0].path]);

  const expander = (chain: string[]): IncludeExpander => (pattern, id, parentName) => {
    const match = includeMatcher(pattern, prefix);
    return parsed
      .filter((p) => match(p.path))
      .map((p, k) => {
        const fid = `${id}>${k}`;
        reached.add(p.path);
        if (chain.includes(p.path)) return fileNode(fid, p, [], "cycle");
        return fileNode(fid, p, convert(p.nodes, fid, parentName, expander([...chain, p.path])), "included");
      });
  };

  const main = parsed[0];
  const tree = convert(main.nodes, "m", "", expander([main.path]));
  parsed.forEach((p, k) => {
    if (!reached.has(p.path)) {
      reached.add(p.path);
      tree.push(fileNode(`u${k}`, p, convert(p.nodes, `u${k}`, "", expander([p.path])), "unreached"));
    }
  });
  return tree;
}

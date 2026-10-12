import { isContainer, isVirtualServer, summarize } from "./summary";
import type { ViewNode } from "./types";

export interface Row {
  node: ViewNode;
  depth: number;
  /** "close" rows draw the `}` of an open block. */
  type: "node" | "close";
  open: boolean;
  /** Id of the parent row's node, for ← navigation. */
  parentId: string | null;
}

/** The rows on screen: open containers show their children; `forced` ids (search hits' parents) count as open. */
export function visibleRows(
  tree: ViewNode[],
  open: Set<string>,
  forced: Set<string>,
  showComments: boolean,
): Row[] {
  const rows: Row[] = [];
  const walk = (nodes: ViewNode[], depth: number, parentId: string | null) => {
    for (const n of nodes) {
      if (n.kind === "comment" && !showComments) continue;
      const isOpen = isContainer(n) && (open.has(n.id) || forced.has(n.id));
      rows.push({ node: n, depth, type: "node", open: isOpen, parentId });
      if (!isOpen) continue;
      walk(n.children, depth + 1, n.id);
      if (n.kind === "block") rows.push({ node: n, depth, type: "close", open: true, parentId });
    }
  };
  walk(tree, 0, null);
  return rows;
}

/** Ids of every container less than `level` deep: "expand to level N". */
export function openToLevel(tree: ViewNode[], level: number): Set<string> {
  const open = new Set<string>();
  const walk = (nodes: ViewNode[], depth: number) => {
    for (const n of nodes) {
      if (!isContainer(n)) continue;
      if (depth < level) open.add(n.id);
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return open;
}

export function allContainerIds(tree: ViewNode[]): Set<string> {
  return openToLevel(tree, Number.POSITIVE_INFINITY);
}

/** Chain of container ids from the root down to (not including) `id`. */
export function ancestorsOf(tree: ViewNode[], id: string): string[] | null {
  const walk = (nodes: ViewNode[], path: string[]): string[] | null => {
    for (const n of nodes) {
      if (n.id === id) return path;
      if (n.children.length) {
        const hit = walk(n.children, [...path, n.id]);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(tree, []);
}

export interface OutlineItem {
  id: string;
  label: string;
  sub: string;
  kind: string;
}

/** Sidebar entries: virtual servers and upstreams (merged view) or files (by-file view). */
export function outline(tree: ViewNode[], mode: "merged" | "files", prefix: string): OutlineItem[] {
  const short = (p: string) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p);
  if (mode === "files") {
    return tree.map((f) => ({ id: f.id, label: short(f.name), sub: summarize(f), kind: "file" }));
  }
  const items: OutlineItem[] = [];
  const walk = (nodes: ViewNode[], context: string) => {
    for (const n of nodes) {
      if (n.kind === "block" && isVirtualServer(n)) {
        const sum = summarize(n);
        const names = n.children.find((c) => c.name === "server_name")?.args ?? [];
        items.push({
          id: n.id,
          label: names[0] ?? "(no server_name)",
          sub: [sum.split(" · ")[0], short(n.file)].filter(Boolean).join(" · "),
          kind: context === "stream" ? "stream" : "server",
        });
      } else if (n.kind === "block" && n.name === "upstream") {
        items.push({ id: n.id, label: n.args.join(" "), sub: summarize(n) + " · " + short(n.file), kind: "upstream" });
      }
      if (n.children.length) walk(n.children, n.kind === "block" && (n.name === "stream" || n.name === "http") ? n.name : context);
    }
  };
  walk(tree, "");
  return items;
}

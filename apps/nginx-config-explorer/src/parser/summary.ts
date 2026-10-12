import type { ViewNode } from "./types";

export function isContainer(n: ViewNode): boolean {
  return (n.kind === "block" || n.kind === "include" || n.kind === "file") && n.children.length > 0;
}

/** Directives inside a node, nested ones included; comments and blank Lua lines don't count. */
export function countDirectives(nodes: ViewNode[]): number {
  let n = 0;
  for (const c of nodes) {
    if (c.kind === "comment") continue;
    if (c.kind !== "file") n++;
    n += countDirectives(c.children);
  }
  return n;
}

export function firstArg(nodes: ViewNode[], name: string): string {
  return nodes.find((c) => c.name === name)?.args.join(" ") ?? "";
}

function plural(n: number, one: string, many = one + "s"): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Whether a `server` block is a virtual host (not an `upstream`'s `server` line). */
export function isVirtualServer(n: ViewNode): boolean {
  return n.kind === "block" && n.name === "server" && n.parentName !== "upstream";
}

/** The one-line description shown next to a folded block: what you'd look inside it for. */
export function summarize(n: ViewNode): string {
  if (n.kind === "file") return plural(countDirectives(n.children), "directive");
  if (n.kind === "include") return plural(n.children.length, "file");
  const kids = directChildren(n);
  if (isVirtualServer(n)) {
    const parts: string[] = [];
    const listens = kids.filter((c) => c.name === "listen").map((c) => c.args.join(" "));
    const names = firstArg(kids, "server_name");
    if (listens.length) parts.push("listen " + listens.join(", "));
    if (names) parts.push(names);
    const locs = kids.filter((c) => c.name === "location").length;
    if (locs) parts.push(plural(locs, "location"));
    if (parts.length) return parts.join(" · ");
  }
  if (n.name === "upstream") return plural(kids.filter((c) => c.name === "server").length, "server");
  if (n.name === "types") return plural(kids.filter((c) => c.kind === "directive").length, "mime type");
  if (n.name === "map" || n.name === "geo" || n.name === "split_clients") {
    return plural(kids.filter((c) => c.kind === "directive").length, "entry", "entries");
  }
  if (n.name.endsWith("_lua_block")) return plural(n.children.filter((c) => c.kind === "raw").length, "line") + " of Lua";
  if (n.name === "location") {
    const target = kids.find((c) => ["proxy_pass", "fastcgi_pass", "uwsgi_pass", "grpc_pass", "return", "alias", "root"].includes(c.name));
    const count = plural(countDirectives(n.children), "directive");
    return target ? `${target.name} ${target.args.join(" ")} · ${count}` : count;
  }
  return plural(countDirectives(n.children), "directive");
}

/** Children of a block, with included files flattened in, so a server's listen from a snippet still counts. */
function directChildren(n: ViewNode): ViewNode[] {
  const out: ViewNode[] = [];
  for (const c of n.children) {
    if (c.kind === "include") c.children.forEach((f) => out.push(...f.children));
    else out.push(c);
  }
  return out;
}

/** One label for a node, used for search, aria labels and the outline. */
export function nodeText(n: ViewNode): string {
  if (n.kind === "comment" || n.kind === "raw") return n.text;
  if (n.kind === "file") return n.name;
  return [n.name, ...n.args].join(" ");
}

export type TokenClass = "block" | "directive" | "string" | "variable" | "number" | "keyword" | "regex" | "plain";

const BLOCKS = new Set([
  "http", "server", "location", "upstream", "events", "types", "map", "if", "geo", "limit_except",
  "stream", "mail", "split_clients", "match", "charset_map",
]);

export function nameClass(kind: string, name: string): TokenClass {
  return kind === "block" && (BLOCKS.has(name) || name.endsWith("_lua_block")) ? "block" : "directive";
}

export function argClass(arg: string, index: number, directive: string): TokenClass {
  if (/^["']/.test(arg)) return arg.includes("$") ? "variable" : "string";
  if (arg.includes("$")) return "variable";
  if (/^(on|off|all|always|any|none|default)$/.test(arg)) return "keyword";
  if (/^(~\*?|=|\^~|!~\*?)$/.test(arg)) return "regex";
  if (directive === "location" && index > 0) return "regex";
  if (/^[0-9][0-9.]*[a-z]*$/i.test(arg)) return "number";
  return "plain";
}

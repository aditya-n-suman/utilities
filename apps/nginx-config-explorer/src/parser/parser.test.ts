import { describe, expect, it } from "vitest";
import { SAMPLE_DUMP } from "../sample";
import { buildModel, includeMatcher } from "./build";
import { parseFile } from "./parse";
import { allContainerIds, ancestorsOf, openToLevel, outline, visibleRows } from "./rows";
import { search, splitMatches, compileQuery } from "./search";
import { splitDump } from "./split";
import { summarize } from "./summary";
import { tokenize } from "./tokenize";
import type { ViewNode } from "./types";

const dump = (...files: [string, string][]) =>
  [
    "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok",
    "nginx: configuration file /etc/nginx/nginx.conf test is successful",
    ...files.flatMap(([p, t]) => [`# configuration file ${p}:`, t, ""]),
  ].join("\n");

const find = (nodes: ViewNode[], pred: (n: ViewNode) => boolean): ViewNode | undefined => {
  for (const n of nodes) {
    if (pred(n)) return n;
    const hit = find(n.children, pred);
    if (hit) return hit;
  }
  return undefined;
};

describe("splitDump", () => {
  it("splits files on headers and reads the test status", () => {
    const d = splitDump(dump(["/etc/nginx/nginx.conf", "user www;\nhttp {\n}"], ["/etc/nginx/a.conf", "x 1;"]));
    expect(d.status).toBe("ok");
    expect(d.statusLines).toHaveLength(2);
    expect(d.files.map((f) => f.path)).toEqual(["/etc/nginx/nginx.conf", "/etc/nginx/a.conf"]);
    expect(d.files[0].text).toBe("user www;\nhttp {\n}");
    expect(d.files[0].dumpLine).toBe(4);
  });

  it("handles CRLF and a BOM", () => {
    const d = splitDump("\uFEFFnginx: configuration file /x test is successful\r\n# configuration file /x:\r\na 1;\r\n");
    expect(d.files).toHaveLength(1);
    expect(d.files[0].text).toBe("a 1;");
  });

  it("treats a headerless upload as one file", () => {
    const d = splitDump("events {}\nhttp { server { listen 80; } }\n", "my.conf");
    expect(d.status).toBe("unknown");
    expect(d.files).toEqual([{ path: "my.conf", text: "events {}\nhttp { server { listen 80; } }", dumpLine: 1 }]);
  });

  it("reports a failed test", () => {
    const d = splitDump('nginx: [emerg] unknown directive "foo" in /etc/nginx/nginx.conf:3\nnginx: configuration file /etc/nginx/nginx.conf test failed\n');
    expect(d.status).toBe("failed");
    expect(d.files).toHaveLength(0);
  });
});

describe("tokenize", () => {
  it("keeps quotes, # inside words and ${var}", () => {
    const words = tokenize(`add_header X "a; b # c" always; set $x a#b; return 200 "\${host}x";`)
      .filter((t) => t.kind === "word")
      .map((t) => (t as { value: string }).value);
    expect(words).toEqual(["add_header", "X", '"a; b # c"', "always", "set", "$x", "a#b", "return", "200", '"${host}x"']);
  });

  it("reads ${var} with braces inside an unquoted word", () => {
    const t = tokenize("set $a ${b}c;");
    expect(t.map((x) => x.kind)).toEqual(["word", "word", "word", "semi"]);
  });

  it("captures a Lua block body verbatim", () => {
    const t = tokenize('content_by_lua_block {\n  local t = { a = "}" } -- }\n  ngx.say(t.a)\n}\nnext 1;');
    const raw = t.find((x) => x.kind === "raw") as { value: string };
    expect(raw.value).toContain('local t = { a = "}" }');
    expect(t.filter((x) => x.kind === "word").map((x) => (x as { value: string }).value)).toEqual(["content_by_lua_block", "next", "1"]);
  });
});

describe("parseFile", () => {
  it("builds nested blocks with line numbers and trailing comments", () => {
    const p = parseFile("f", "http {\n  # c\n  server {\n    listen 80; # main\n  }\n}");
    expect(p.warnings).toEqual([]);
    const http = p.nodes[0];
    expect(http).toMatchObject({ type: "block", name: "http", line: 1 });
    expect(http.children[0]).toMatchObject({ type: "comment", text: "# c", line: 2 });
    const listen = http.children[1].children[0];
    expect(listen).toMatchObject({ name: "listen", args: ["80"], line: 4, trailing: "# main" });
  });

  it("handles directives spanning lines and multi-line strings", () => {
    const p = parseFile("f", "log_format main\n  '$a'\n  '$b';\nx 'one\ntwo';\ny 1;");
    expect(p.nodes.map((n) => [n.name, n.line])).toEqual([["log_format", 1], ["x", 4], ["y", 6]]);
  });

  it("never throws on broken braces", () => {
    const p = parseFile("f", "}\nserver {\n listen 80\n}\nhttp {\n  a 1;");
    expect(p.warnings.map((w) => w.message)).toEqual([
      'unexpected "}"',
      'missing ";" after "listen"',
      'missing "}" for "http" opened here',
    ]);
    expect(p.nodes.map((n) => n.name)).toEqual(["server", "http"]);
    expect(p.nodes[0].children[0]).toMatchObject({ name: "listen", args: ["80"] });
  });

  it("turns a Lua body into raw lines", () => {
    const p = parseFile("f", "location / {\n  content_by_lua_block {\n    if x then\n      y()\n    end\n  }\n}");
    const lua = p.nodes[0].children[0];
    expect(lua.children.map((c) => [c.type, c.text, c.line])).toEqual([
      ["raw", "if x then", 3],
      ["raw", "  y()", 4],
      ["raw", "end", 5],
    ]);
  });
});

describe("includes", () => {
  it("matches globs, exact and relative paths", () => {
    expect(includeMatcher("/etc/nginx/conf.d/*.conf", "/etc/nginx/")("/etc/nginx/conf.d/a.conf")).toBe(true);
    expect(includeMatcher("/etc/nginx/conf.d/*.conf", "/etc/nginx/")("/etc/nginx/conf.d/sub/a.conf")).toBe(false);
    expect(includeMatcher("mime.types", "/etc/nginx/")("/etc/nginx/mime.types")).toBe(true);
    expect(includeMatcher("sites-enabled/*", "/etc/nginx/")("/etc/nginx/sites-enabled/example.com")).toBe(true);
    expect(includeMatcher("conf.d/[ab].conf", "/etc/nginx/")("/etc/nginx/conf.d/b.conf")).toBe(true);
    expect(includeMatcher('"snippets/x.conf"', "/etc/nginx/")("/etc/nginx/snippets/x.conf")).toBe(true);
  });

  it("inlines included files in the merged view and flags missing and cyclic ones", () => {
    const m = buildModel(
      splitDump(
        dump(
          ["/etc/nginx/nginx.conf", "http {\n  include conf.d/*.conf;\n  include missing.conf;\n}"],
          ["/etc/nginx/conf.d/a.conf", "server {\n  listen 80;\n  include /etc/nginx/conf.d/a.conf;\n}"],
          ["/etc/nginx/orphan.conf", "x 1;"],
        ),
      ),
    );
    const merged = m.trees.merged;
    const inc = find(merged, (n) => n.kind === "include" && n.args[0] === "conf.d/*.conf")!;
    expect(inc.children.map((f) => [f.kind, f.name, f.note])).toEqual([["file", "/etc/nginx/conf.d/a.conf", "included"]]);
    const server = inc.children[0].children[0];
    expect(server.parentName).toBe("http");
    const self = find(server.children, (n) => n.kind === "include")!;
    expect(self.children[0].note).toBe("cycle");
    expect(find(merged, (n) => n.args[0] === "missing.conf")!.missing).toBe(true);
    expect(merged[merged.length - 1]).toMatchObject({ kind: "file", name: "/etc/nginx/orphan.conf", note: "unreached" });
    // ids are unique even when a file is inlined more than once
    const ids = new Set<string>();
    const walk = (ns: ViewNode[]) => ns.forEach((n) => (expect(ids.has(n.id)).toBe(false), ids.add(n.id), walk(n.children)));
    walk(merged);
  });

  it("keeps includes as plain directives in the by-file view", () => {
    const m = buildModel(splitDump(SAMPLE_DUMP));
    expect(m.trees.files.map((f) => f.kind)).toEqual(m.dump.files.map(() => "file"));
    expect(find(m.trees.files, (n) => n.name === "include")!.kind).toBe("directive");
  });
});

describe("explorer model on the sample", () => {
  const m = buildModel(splitDump(SAMPLE_DUMP));

  it("parses the sample cleanly", () => {
    expect(m.warnings).toEqual([]);
    expect(m.dump.status).toBe("ok");
    expect(m.prefix).toBe("/etc/nginx/");
  });

  it("summarizes folded blocks", () => {
    const tree = m.trees.merged;
    const https = find(tree, (n) => n.name === "server" && n.children.some((c) => c.args[0] === "443"))!;
    expect(summarize(https)).toBe("listen 443 ssl http2 · example.com www.example.com · 5 locations");
    expect(summarize(find(tree, (n) => n.name === "upstream")!)).toBe("2 servers");
    expect(summarize(find(tree, (n) => n.name === "types")!)).toBe("12 mime types");
    expect(summarize(find(tree, (n) => n.args[0] === "@app")!)).toBe("proxy_pass http://app_backend · 4 directives");
  });

  it("lists servers and upstreams in the outline", () => {
    const o = outline(m.trees.merged, "merged", m.prefix);
    expect(o.map((i) => [i.kind, i.label])).toEqual([
      ["upstream", "app_backend"],
      ["server", "example.com"],
      ["server", "example.com"],
      ["server", "admin.internal"],
    ]);
    expect(o[1].sub).toBe("listen 80, [::]:80 · sites-enabled/example.com");
  });

  it("shows only open levels and reveals search hits", () => {
    const tree = m.trees.merged;
    const level1 = visibleRows(tree, openToLevel(tree, 1), new Set(), true);
    expect(level1.some((r) => r.node.name === "server")).toBe(false);
    const res = search(tree, "server_name admin.internal", true);
    expect(res.ids.length).toBe(1);
    const rows = visibleRows(tree, new Set(), res.reveal, true);
    expect(rows.some((r) => r.node.id === res.ids[0])).toBe(true);
    expect(ancestorsOf(tree, res.ids[0])!.length).toBeGreaterThan(2);
    const all = visibleRows(tree, allContainerIds(tree), new Set(), false);
    expect(all.some((r) => r.node.kind === "comment")).toBe(false);
    expect(all.filter((r) => r.type === "close").length).toBeGreaterThan(5);
  });

  it("supports /regex/ queries and highlights matches", () => {
    expect(search(m.trees.merged, "/listen\\s+443/", true).ids).toHaveLength(1);
    expect(search(m.trees.merged, "/(/", true).error).toBeTruthy();
    const { re } = compileQuery("app");
    expect(splitMatches("proxy_pass http://app_backend", re)).toEqual([
      { text: "proxy_pass http://", hit: false },
      { text: "app", hit: true },
      { text: "_backend", hit: false },
    ]);
  });
});

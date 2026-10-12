export type Token =
  | { kind: "word"; value: string; line: number }
  | { kind: "open" | "close" | "semi"; line: number }
  | { kind: "comment"; value: string; line: number }
  /** Verbatim body of a `*_by_lua_block { … }`, without the outer braces. */
  | { kind: "raw"; value: string; line: number };

const SPACE = /\s/;

/**
 * Tokenize one config file the way nginx's own lexer does: words, quoted
 * strings (quotes kept, may span lines), `#` comments only at a token start,
 * `${var}` inside words, and `{ } ;`. A `{` right after a word ending in
 * `_by_lua_block` / `_lua_block` swallows the Lua body as one raw token.
 */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;

  while (i < n) {
    const ch = src[i];
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (SPACE.test(ch)) {
      i++;
      continue;
    }
    if (ch === "#") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      out.push({ kind: "comment", value: src.slice(i, j).trimEnd(), line });
      i = j;
      continue;
    }
    if (ch === ";") {
      out.push({ kind: "semi", line });
      i++;
      continue;
    }
    if (ch === "}") {
      out.push({ kind: "close", line });
      i++;
      continue;
    }
    if (ch === "{") {
      out.push({ kind: "open", line });
      i++;
      if (isLuaBlockStart(out)) {
        const end = luaBlockEnd(src, i);
        const body = src.slice(i, end);
        out.push({ kind: "raw", value: body, line });
        for (const c of body) if (c === "\n") line++;
        i = end;
        if (i < n) {
          out.push({ kind: "close", line });
          i++;
        }
      }
      continue;
    }

    // A word: optionally a quoted string, otherwise up to whitespace or ; { }.
    const startLine = line;
    let j = i;
    if (ch === '"' || ch === "'") {
      j = i + 1;
      while (j < n && src[j] !== ch) {
        if (src[j] === "\\") j++;
        else if (src[j] === "\n") line++;
        j++;
      }
      j = Math.min(j + 1, n);
    } else {
      while (j < n) {
        const c = src[j];
        if (c === "$" && src[j + 1] === "{") {
          const close = src.indexOf("}", j);
          j = close < 0 ? n : close + 1;
          continue;
        }
        if (c === "\\" && j + 1 < n) {
          j += 2;
          continue;
        }
        if (SPACE.test(c) || c === ";" || c === "{" || c === "}") break;
        j++;
      }
    }
    out.push({ kind: "word", value: src.slice(i, j), line: startLine });
    i = j;
  }
  return out;
}

function isLuaBlockStart(tokens: Token[]): boolean {
  // tokens ends with "open"; walk back to the directive name (first word after the last ; { } ).
  let k = tokens.length - 2;
  let name: string | null = null;
  while (k >= 0) {
    const t = tokens[k];
    if (t.kind === "word") name = t.value;
    else if (t.kind !== "comment") break;
    k--;
  }
  return name !== null && /_lua_block$/.test(name);
}

/** Index of the `}` that closes a Lua block body starting at `from`. Skips Lua strings and comments. */
function luaBlockEnd(src: string, from: number): number {
  let depth = 1;
  let i = from;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "-" && src[i + 1] === "-") {
      if (src[i + 2] === "[" && src[i + 3] === "[") {
        const close = src.indexOf("]]", i + 4);
        i = close < 0 ? n : close + 2;
      } else {
        while (i < n && src[i] !== "\n") i++;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "[" && src[i + 1] === "[") {
      const close = src.indexOf("]]", i + 2);
      i = close < 0 ? n : close + 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return n;
}

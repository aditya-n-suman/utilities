import { tokenize } from "./tokenize";
import type { ParsedFile, ParsedNode, ParseWarning } from "./types";

/**
 * Parse one config file into a tree. Never throws: a stray `}`, a missing `}`
 * or a missing `;` becomes a warning and the parser carries on.
 */
export function parseFile(path: string, text: string): ParsedFile {
  const tokens = tokenize(text);
  const warnings: ParseWarning[] = [];
  const root: ParsedNode[] = [];
  const stack: { children: ParsedNode[]; node: ParsedNode | null }[] = [{ children: root, node: null }];
  let words: { value: string; line: number }[] = [];
  /** Last node closed on a line, so a `# comment` on that same line can attach to it. */
  let lastEnded: { node: ParsedNode; line: number } | null = null;

  const top = () => stack[stack.length - 1];
  const make = (type: ParsedNode["type"], line: number): ParsedNode => ({
    type,
    name: type === "directive" || type === "block" ? words[0]?.value ?? "" : "",
    args: type === "directive" || type === "block" ? words.slice(1).map((w) => w.value) : [],
    text: "",
    line,
    file: path,
    children: [],
  });

  for (const t of tokens) {
    switch (t.kind) {
      case "word":
        words.push({ value: t.value, line: t.line });
        break;
      case "comment":
        if (words.length === 0 && lastEnded && lastEnded.line === t.line && !lastEnded.node.trailing) {
          lastEnded.node.trailing = t.value;
        } else {
          top().children.push({ ...make("comment", t.line), text: t.value });
        }
        break;
      case "semi": {
        if (words.length === 0) {
          warnings.push({ file: path, line: t.line, message: "unexpected \";\"" });
          break;
        }
        const node = make("directive", words[0].line);
        top().children.push(node);
        lastEnded = { node, line: t.line };
        words = [];
        break;
      }
      case "open": {
        if (words.length === 0) warnings.push({ file: path, line: t.line, message: "block without a name" });
        const node = make("block", words[0]?.line ?? t.line);
        top().children.push(node);
        stack.push({ children: node.children, node });
        lastEnded = { node, line: t.line };
        words = [];
        break;
      }
      case "raw": {
        const lines = dedent(t.value);
        lines.forEach((l, k) => {
          if (l.trim() === "") return;
          top().children.push({ ...make("raw", t.line + k), text: l });
        });
        break;
      }
      case "close": {
        if (words.length > 0) {
          warnings.push({ file: path, line: words[0].line, message: `missing ";" after "${words[0].value}"` });
          top().children.push(make("directive", words[0].line));
          words = [];
        }
        if (stack.length === 1) {
          warnings.push({ file: path, line: t.line, message: "unexpected \"}\"" });
          break;
        }
        const closed = stack.pop()!.node!;
        lastEnded = { node: closed, line: t.line };
        break;
      }
    }
  }

  if (words.length > 0) {
    warnings.push({ file: path, line: words[0].line, message: `missing ";" after "${words[0].value}"` });
    top().children.push(make("directive", words[0].line));
  }
  while (stack.length > 1) {
    const open = stack.pop()!.node!;
    warnings.push({ file: path, line: open.line, message: `missing "}" for "${open.name}" opened here` });
  }

  return { path, nodes: root, warnings, lineCount: text === "" ? 0 : text.split("\n").length };
}

/** Lua body lines with the common indentation removed; leading/trailing blank lines kept so line numbers stay right. */
function dedent(body: string): string[] {
  const lines = body.split("\n");
  const indents = lines.filter((l) => l.trim() !== "").map((l) => /^[ \t]*/.exec(l)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut).trimEnd());
}

import { memo, type MouseEvent, type ReactNode } from "react";
import type { Row } from "../parser/rows";
import { splitMatches } from "../parser/search";
import { isContainer, nodeText, summarize } from "../parser/summary";
import { argClass, nameClass } from "../parser/syntax";
import { ChevronRight, FileIcon } from "./Icons";

interface Props {
  row: Row;
  query: RegExp | null;
  showComments: boolean;
  isMatch: boolean;
  isCurrent: boolean;
  isCursor: boolean;
  tabbable: boolean;
  onToggle: (id: string, deep: boolean) => void;
  onCursor: (key: string) => void;
}

export function rowKey(row: Row): string {
  return row.type === "close" ? row.node.id + "/}" : row.node.id;
}

export function rowDomId(key: string): string {
  return "row-" + key.replace(/[^A-Za-z0-9_-]/g, "_");
}

const NOTE_LABEL = { included: "included", unreached: "not included from the main config", cycle: "include loop: not expanded" };

function TreeRow({ row, query, showComments, isMatch, isCurrent, isCursor, tabbable, onToggle, onCursor }: Props) {
  const { node: n, depth, open } = row;
  const key = rowKey(row);
  const container = row.type === "node" && isContainer(n);

  // Coloured pieces of the line; search highlighting runs over the joined text so a hit can span tokens.
  type Part = { text: string; cls: string };
  const parts: Part[] = [];
  const add = (value: string, cls: string) => parts.push({ text: value, cls });
  let prefix: ReactNode = null;
  let suffix: Part[] = [];
  if (row.type === "close") add("}", "punct");
  else if (n.kind === "comment") add(n.text, "comment");
  else if (n.kind === "raw") add(n.text, "raw");
  else if (n.kind === "file") {
    prefix = (
      <span className="file-icon">
        <FileIcon size={15} />
      </span>
    );
    add(n.name, "file");
  } else {
    add(n.name, nameClass(n.kind, n.name));
    n.args.forEach((a, i) => {
      add(" ", "plain");
      add(a, argClass(a, i, n.name));
    });
    add(n.kind === "block" ? " {" : ";", "punct");
    if (n.trailing && showComments) suffix = [{ text: n.trailing, cls: "comment" }];
  }

  const body = (
    <>
      {prefix}
      {highlight(parts, query)}
      {suffix.length > 0 && <span className="trailing">{highlight(suffix, query)}</span>}
    </>
  );

  const summary = row.type === "node" && container && (!open || n.kind === "file") ? summarize(n) : "";
  const badge =
    row.type === "node" && n.kind === "include" && n.missing
      ? { cls: "badge-warn", label: "not in dump" }
      : row.type === "node" && n.kind === "file" && n.note
        ? { cls: n.note === "included" ? "badge-ok" : "badge-warn", label: NOTE_LABEL[n.note] }
        : null;

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    onToggle(n.id, e.altKey);
  };
  const where = n.kind === "file" ? n.name : `${n.file}:${n.line}`;

  return (
    <div
      id={rowDomId(key)}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={container ? open : undefined}
      aria-label={row.type === "close" ? "end of " + n.name : undefined}
      tabIndex={tabbable ? 0 : -1}
      title={row.type === "close" ? undefined : where}
      className={
        "row" +
        (n.kind === "file" && row.type === "node" ? " row-file" : "") +
        (isMatch ? " is-match" : "") +
        (isCurrent ? " is-current" : "") +
        (isCursor ? " is-cursor" : "")
      }
      onClick={(e) => {
        onCursor(key);
        // Clicking a block's line toggles it, unless the user is selecting text.
        if (container && !window.getSelection()?.toString()) onToggle(n.id, e.altKey);
      }}
    >
      <span className="gutter">{row.type === "node" && n.kind !== "file" ? n.line : ""}</span>
      <span className="indent" style={{ width: depth * 22 }} />
      {container ? (
        <button
          type="button"
          tabIndex={-1}
          className={"caret" + (open ? " is-open" : "")}
          aria-label={(open ? "Collapse " : "Expand ") + nodeText(n)}
          onClick={toggle}
        >
          <ChevronRight size={14} width={2.5} />
        </button>
      ) : (
        <span className="caret-space" />
      )}
      <span className="code">{body}</span>
      {container && !open && n.kind === "block" && (
        <button type="button" tabIndex={-1} className="ellipsis" aria-label={"Expand " + nodeText(n)} onClick={toggle}>
          {"… }"}
        </button>
      )}
      {summary && <span className="summary">{summary}</span>}
      {badge && <span className={"badge " + badge.cls}>{badge.label}</span>}
    </div>
  );
}

/** Render coloured parts, marking search hits over the joined text. */
function highlight(parts: { text: string; cls: string }[], query: RegExp | null): ReactNode[] {
  const full = parts.map((p) => p.text).join("");
  const hits: [number, number][] = [];
  let at = 0;
  for (const m of splitMatches(full, query)) {
    if (m.hit) hits.push([at, at + m.text.length]);
    at += m.text.length;
  }
  const out: ReactNode[] = [];
  let pos = 0;
  parts.forEach((p, i) => {
    const start = pos;
    const end = pos + p.text.length;
    pos = end;
    let cut = start;
    for (const [hs, he] of hits) {
      if (he <= cut || hs >= end) continue;
      if (hs > cut) out.push(<span key={`${i}-${cut}`} className={"tok-" + p.cls}>{full.slice(cut, hs)}</span>);
      const e = Math.min(he, end);
      out.push(<span key={`${i}-${Math.max(hs, cut)}h`} className={"tok-" + p.cls + " hit"}>{full.slice(Math.max(hs, cut), e)}</span>);
      cut = e;
    }
    if (cut < end) out.push(<span key={`${i}-${cut}`} className={"tok-" + p.cls}>{full.slice(cut, end)}</span>);
  });
  return out;
}

// Rows are rebuilt on every change, so compare what a row shows rather than object identity.
export default memo(TreeRow, (a, b) => {
  const ra = a.row;
  const rb = b.row;
  return (
    ra.node === rb.node &&
    ra.depth === rb.depth &&
    ra.open === rb.open &&
    ra.type === rb.type &&
    a.query === b.query &&
    a.showComments === b.showComments &&
    a.isMatch === b.isMatch &&
    a.isCurrent === b.isCurrent &&
    a.isCursor === b.isCursor &&
    a.tabbable === b.tabbable &&
    a.onToggle === b.onToggle &&
    a.onCursor === b.onCursor
  );
});

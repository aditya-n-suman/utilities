import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Loaded } from "../App";
import { allContainerIds, ancestorsOf, openToLevel, outline, visibleRows } from "../parser/rows";
import { compileQuery, search } from "../parser/search";
import { isContainer } from "../parser/summary";
import type { ViewMode, ViewNode } from "../parser/types";
import { AlertIcon, BracesIcon, CheckIcon, ChevronDown, ChevronUp, FileIcon, SearchIcon, UploadIcon } from "./Icons";
import TreeRow, { rowDomId, rowKey } from "./TreeRow";

const DEFAULT_LEVEL = 2;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function findNode(nodes: ViewNode[], id: string): ViewNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

export default function Explorer({ model, name, size, onClose }: Loaded & { onClose: () => void }) {
  const [view, setView] = useState<ViewMode>("merged");
  const [openByView, setOpenByView] = useState<Record<ViewMode, Set<string>>>(() => ({
    merged: openToLevel(model.trees.merged, DEFAULT_LEVEL),
    files: openToLevel(model.trees.files, DEFAULT_LEVEL),
  }));
  const [level, setLevel] = useState<number | null>(DEFAULT_LEVEL);
  const [showComments, setShowComments] = useState(true);
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  /** Blocks the user folded although a search hit sits inside them. */
  const [folded, setFolded] = useState<Set<string>>(new Set());
  /** Row to bring into view after the next render; `focus` moves keyboard focus there too. */
  const scrollTarget = useRef<{ key: string; focus: boolean } | null>(null);

  const tree = model.trees[view];
  const open = openByView[view];
  const setOpen = useCallback(
    (next: Set<string>) => setOpenByView((prev) => ({ ...prev, [view]: next })),
    [view],
  );

  const compiled = useMemo(() => compileQuery(query), [query]);
  const result = useMemo(() => search(tree, query, showComments), [tree, query, showComments]);
  const matchSet = useMemo(() => new Set(result.ids), [result]);
  const current = result.ids.length ? result.ids[((matchIdx % result.ids.length) + result.ids.length) % result.ids.length] : null;
  const forced = useMemo(() => new Set([...result.reveal].filter((id) => !folded.has(id))), [result, folded]);
  const rows = useMemo(() => visibleRows(tree, open, forced, showComments), [tree, open, forced, showComments]);
  const items = useMemo(() => outline(tree, view, model.prefix), [tree, view, model.prefix]);

  const scrollToRow = (key: string, focus: boolean) => {
    scrollTarget.current = { key, focus };
  };
  useEffect(() => {
    const target = scrollTarget.current;
    if (!target) return;
    const el = document.getElementById(rowDomId(target.key));
    if (!el) return;
    scrollTarget.current = null;
    el.scrollIntoView({ block: target.focus ? "nearest" : "center" });
    if (target.focus) el.focus({ preventScroll: true });
  });

  // Bring the current search hit into view without taking focus from the search box.
  useEffect(() => {
    if (!current) return;
    scrollToRow(current, false);
    setCursor(current);
  }, [current]);

  useEffect(() => setFolded(new Set()), [query]);

  const toggle = useCallback(
    (id: string, deep: boolean) => {
      const next = new Set(open);
      const node = deep ? findNode(tree, id) : null;
      const ids = node ? [...allContainerIds([node])] : [id];
      const closing = open.has(id) || forced.has(id);
      ids.forEach((x) => (closing ? next.delete(x) : next.add(x)));
      setFolded((prev) => {
        const f = new Set(prev);
        ids.forEach((x) => (closing ? f.add(x) : f.delete(x)));
        return f;
      });
      setOpen(next);
      setLevel(null);
    },
    [open, tree, forced, setOpen],
  );
  // Stable identity for the rows, so a toggle re-renders only the rows that changed.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const onToggle = useCallback((id: string, deep: boolean) => toggleRef.current(id, deep), []);

  const jumpTo = (id: string) => {
    const anc = ancestorsOf(tree, id) ?? [];
    const next = new Set(open);
    anc.forEach((a) => next.add(a));
    setOpen(next);
    setFolded((prev) => new Set([...prev].filter((x) => !anc.includes(x))));
    setFocusId(id);
    setCursor(id);
    scrollToRow(id, false);
  };

  const switchView = (v: ViewMode) => {
    setView(v);
    setFocusId(null);
    setCursor(null);
    setMatchIdx(0);
  };

  const step = (delta: number) => {
    if (result.ids.length) setMatchIdx((i) => i + delta);
  };

  // Keyboard navigation for the tree (WAI-ARIA tree pattern).
  const onTreeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!rows.length) return;
    const keys = rows.map(rowKey);
    let i = cursor ? keys.indexOf(cursor) : -1;
    if (i < 0) i = 0;
    const row = rows[i];
    const container = row.type === "node" && isContainer(row.node);
    const move = (j: number) => {
      const k = keys[Math.max(0, Math.min(keys.length - 1, j))];
      setCursor(k);
      scrollToRow(k, true);
    };
    switch (e.key) {
      case "ArrowDown":
        move(i + 1);
        break;
      case "ArrowUp":
        move(i - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(keys.length - 1);
        break;
      case "ArrowRight":
        if (container && !row.open) onToggle(row.node.id, e.altKey);
        else if (container) move(i + 1);
        break;
      case "ArrowLeft":
        if (container && row.open && row.type === "node") onToggle(row.node.id, e.altKey);
        else if (row.parentId) move(keys.indexOf(row.parentId));
        break;
      case "Enter":
      case " ":
        if (container) onToggle(row.node.id, e.altKey);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const levelButton = (n: number) => (
    <button
      key={n}
      type="button"
      className={"level" + (level === n ? " is-active" : "")}
      aria-pressed={level === n}
      aria-label={`Expand to level ${n}`}
      onClick={() => {
        setOpen(openToLevel(tree, n));
        setLevel(n);
        setFocusId(null);
      }}
    >
      {n}
    </button>
  );

  const status = model.dump.status;
  const cursorKey = cursor && rows.some((r) => rowKey(r) === cursor) ? cursor : rows.length ? rowKey(rows[0]) : null;

  return (
    <div className="page">
      <header className="topbar topbar-tight">
        <div className="topbar-left">
          <button type="button" className="logo" aria-label="Back to start" onClick={onClose}>
            <BracesIcon />
          </button>
          <span className="brand-name brand-sm">nginx -T Explorer</span>
          <span className="filechip">
            <FileIcon size={14} />
            <span className="mono ink">{name}</span>
            <span>
              {formatSize(size)} · {model.dump.files.length} {model.dump.files.length === 1 ? "file" : "files"} ·{" "}
              {model.totalLines.toLocaleString()} lines
            </span>
          </span>
          {status === "ok" && (
            <span className="pill pill-ok">
              <CheckIcon />
              syntax is ok · test is successful
            </span>
          )}
          {status === "failed" && (
            <span className="pill pill-bad">
              <AlertIcon />
              config test failed
            </span>
          )}
          {status === "unknown" && <span className="pill pill-neutral">no nginx -t result in file</span>}
          {model.warnings.length > 0 && (
            <details className="warnings">
              <summary className="pill pill-warn">
                <AlertIcon />
                {model.warnings.length} parse {model.warnings.length === 1 ? "warning" : "warnings"}
              </summary>
              <ul>
                {model.warnings.map((w, i) => (
                  <li key={i}>
                    <span className="mono">
                      {w.file}:{w.line}
                    </span>{" "}
                    {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          <UploadIcon size={16} />
          Open another
        </button>
      </header>

      <div role="toolbar" aria-label="View controls" className="toolbar">
        <div className="segmented">
          <button type="button" aria-pressed={view === "merged"} className={view === "merged" ? "is-on" : ""} onClick={() => switchView("merged")}>
            Merged includes
          </button>
          <button type="button" aria-pressed={view === "files"} className={view === "files" ? "is-on" : ""} onClick={() => switchView("files")}>
            By file
          </button>
        </div>
        <div className="group">
          <button
            type="button"
            className="btn btn-xs"
            onClick={() => {
              setOpen(allContainerIds(tree));
              setLevel(null);
            }}
          >
            Expand all
          </button>
          <button
            type="button"
            className="btn btn-xs"
            onClick={() => {
              setOpen(new Set());
              setLevel(null);
              setFocusId(null);
            }}
          >
            Collapse all
          </button>
        </div>
        <div className="group muted">
          <span>Level</span>
          {[1, 2, 3].map(levelButton)}
        </div>
        <label className="check">
          <input type="checkbox" checked={showComments} onChange={(e) => setShowComments(e.target.checked)} />
          Comments
        </label>
        <div className="search-wrap">
          <div className={"search" + (result.error ? " has-error" : "")}>
            <SearchIcon />
            <label htmlFor="q" className="sr-only">
              Search config
            </label>
            <input
              id="q"
              type="search"
              value={query}
              placeholder="Search config, or /regex/"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchIdx(0);
                setFocusId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  step(e.shiftKey ? -1 : 1);
                } else if (e.key === "Escape") setQuery("");
              }}
            />
            <span className="count" aria-live="polite">
              {result.error
                ? "bad regex"
                : query.trim()
                  ? result.ids.length
                    ? `${result.ids.indexOf(current!) + 1} of ${result.ids.length}`
                    : "no matches"
                  : ""}
            </span>
            <button type="button" className="icon-btn" aria-label="Previous match" onClick={() => step(-1)}>
              <ChevronUp />
            </button>
            <button type="button" className="icon-btn" aria-label="Next match" onClick={() => step(1)}>
              <ChevronDown />
            </button>
          </div>
        </div>
      </div>

      <div className="workspace">
        <nav aria-label="Outline" className="outline">
          <span className="outline-title">{view === "merged" ? "Servers & upstreams" : "Files in this dump"}</span>
          {items.length === 0 && <span className="muted outline-empty">No server or upstream blocks found.</span>}
          {items.map((o) => (
            <button key={o.id} type="button" className={"outline-item" + (focusId === o.id ? " is-on" : "")} onClick={() => jumpTo(o.id)}>
              <span className="outline-text">
                <span className="outline-label">{o.label}</span>
                <span className="outline-sub">{o.sub}</span>
              </span>
              <span className="outline-kind">{o.kind}</span>
            </button>
          ))}
        </nav>

        <section aria-label="Configuration tree" className="treepanel">
          <div className="tree-caption">
            <span>
              {view === "merged"
                ? `Starting at ${model.dump.files[0]?.path ?? ""}, every include opened where nginx reads it`
                : "Each file as nginx -T printed it"}
            </span>
            <span className="legend" aria-hidden="true">
              <span><i className="sw sw-block" />block</span>
              <span><i className="sw sw-dir" />directive</span>
              <span><i className="sw sw-var" />$variable</span>
              <span><i className="sw sw-str" />string</span>
            </span>
          </div>
          <div className="tree-scroll">
            <div role="tree" aria-label="nginx configuration" className="tree" onKeyDown={onTreeKey}>
              {rows.map((row) => {
                const key = rowKey(row);
                const id = row.node.id;
                return (
                  <TreeRow
                    key={key}
                    row={row}
                    query={row.type === "node" && matchSet.has(id) ? compiled.re : null}
                    showComments={showComments}
                    isMatch={row.type === "node" && matchSet.has(id)}
                    isCurrent={row.type === "node" && (id === current || id === focusId)}
                    isCursor={key === cursor}
                    tabbable={key === cursorKey}
                    onToggle={onToggle}
                    onCursor={setCursor}
                  />
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

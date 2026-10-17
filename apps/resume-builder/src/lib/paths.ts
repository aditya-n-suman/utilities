// Dot paths into the resume document: "work.0.highlights.1.text".
// The same strings are the preview's data-path, the form's data-field and
// the validator's error location; that is what ties the three together.

type Obj = Record<string, unknown>;

export function getAt(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((a, k) => (a == null ? a : (a as Obj)[k]), o);
}

/**
 * Immutably set a value. Missing containers are created (an array when the
 * next key is an index). An empty string or undefined removes the key from an
 * object, so cleared optional fields don't linger as "".
 */
export function setAt<T>(root: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const go = (node: unknown, i: number): unknown => {
    const k = keys[i];
    const base: Obj | unknown[] = Array.isArray(node)
      ? [...node]
      : node && typeof node === "object"
        ? { ...(node as Obj) }
        : /^\d+$/.test(k)
          ? []
          : {};
    if (i === keys.length - 1) {
      if ((value === "" || value === undefined) && !Array.isArray(base)) delete (base as Obj)[k];
      else (base as Obj)[k] = value;
      return base;
    }
    (base as Obj)[k] = go((base as Obj)[k], i + 1);
    return base;
  };
  return go(root, 0) as T;
}

/** Immutably remove the key or array item at `path`. */
export function deleteAt<T>(root: T, path: string): T {
  const i = path.lastIndexOf(".");
  const parentPath = path.slice(0, i);
  const key = path.slice(i + 1);
  const parent = i < 0 ? root : getAt(root, parentPath);
  if (parent == null || typeof parent !== "object") return root;
  if (Array.isArray(parent)) {
    const next = parent.filter((_, j) => j !== +key);
    return i < 0 ? (next as T) : setAt(root, parentPath, next);
  }
  const next = { ...(parent as Obj) };
  delete next[key];
  return i < 0 ? (next as T) : setAt(root, parentPath, next);
}

/** Immutably change the array at `path` with `fn`, which may mutate its copy. */
export function updateList<T>(root: T, path: string, fn: (list: unknown[]) => void): T {
  const cur = getAt(root, path);
  const list = Array.isArray(cur) ? [...cur] : [];
  fn(list);
  return setAt(root, path, list);
}

export function move<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** "work.0.startDate" → "work[0].startDate", the way JSON tools show paths. */
export const toBracket = (dot: string) => dot.replace(/\.(\d+)(?=\.|$)/g, "[$1]");

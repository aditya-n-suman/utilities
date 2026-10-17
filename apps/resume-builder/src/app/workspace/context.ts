import { createContext, useContext } from "react";
import type { Resume } from "../../lib/types";
import type { Problem } from "../validate";

export interface Ws {
  doc: Resume;
  /** Set one value by dot path ("" removes an optional field). */
  set: (path: string, value: unknown) => void;
  /** Replace the whole document. */
  update: (fn: (d: Resume) => Resume) => void;
  errors: Map<string, Problem>;
  /** The focused form field, highlighted in the preview. */
  active: string | null;
  /** Ask the form to focus a field after the next render. */
  focusField: (path: string) => void;
  toast: (msg: string, undo?: Resume) => void;
}

export const WsContext = createContext<Ws | null>(null);

export function useWs(): Ws {
  const ws = useContext(WsContext);
  if (!ws) throw new Error("useWs outside the workspace");
  return ws;
}

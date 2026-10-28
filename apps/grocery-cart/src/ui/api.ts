// The UI's link to the local server: live state over SSE, actions as POSTs.

import { useEffect, useState } from "react";
import type { AppState } from "../local/app.ts";

export type { AppState };

export function useAppState(): { state?: AppState; online: boolean } {
  const [state, setState] = useState<AppState>();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      setState(JSON.parse(e.data as string) as AppState);
      setOnline(true);
    };
    es.onerror = () => setOnline(false); // EventSource reconnects by itself
    return () => es.close();
  }, []);
  return { state, online };
}

export async function act(action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()) as Record<string, unknown>;
}

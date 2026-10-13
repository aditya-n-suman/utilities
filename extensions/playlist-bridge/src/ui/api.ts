// The UI's single entry point to the engine (was HTTP calls to the FastAPI backend in the web app).
import { engine, type ConvertInput, type EditAction } from "@/engine";
import type { Candidate, Privacy, SaveProgress } from "@/engine/types";

export * from "@/engine/types";

export const api = {
  convert: (input: ConvertInput) => engine.convert(input),
  subscribe: engine.subscribe,
  edit: (jobId: string, index: number, body: { action: EditAction; candidate?: Candidate }) =>
    engine.edit(jobId, index, body.action, body.candidate),
  search: (jobId: string, index: number, q: string) => engine.search(jobId, index, q),
  retryErrors: (jobId: string) => engine.retryErrors(jobId),
  links: (jobId: string) => engine.links(jobId),
  session: () => engine.session(),
  onSessionChange: (callback: () => void) => engine.onSessionChange(callback),
  save: (jobId: string, body: { privacy: Privacy; title?: string }, onProgress: (p: SaveProgress) => void) =>
    engine.save(jobId, body, onProgress),
  resumable: () => engine.resumable(),
  resume: (jobId: string) => engine.resume(jobId),
  setStage: (jobId: string, stage: "matching" | "review" | "result") => engine.setStage(jobId, stage),
  discard: (jobId: string) => engine.discard(jobId),
  clearCache: () => engine.clearCache(),
  /** Builds the match report in the browser and downloads it. */
  async downloadReport(jobId: string) {
    const { filename, csv } = await engine.reportCsv(jobId);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

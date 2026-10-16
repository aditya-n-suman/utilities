// PDF export through the browser's print dialog ("Save as PDF"). The PDF
// keeps real, selectable text and working links, which ATS parsers need.
//
// The resume is rendered into a print-only root next to the app; print CSS
// hides everything else. @page carries the page size and margins, so every
// page (not just the first) gets them.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { PAGE, ResumePage } from "../templates/ResumePage";
import type { PageSize, Resume } from "./types";
import { buildView, type ViewOptions } from "./view";

export const documentTitle = (doc: Resume) => doc.meta?.title || `${doc.basics?.name || "Resume"} - Resume`;

export async function printResume(doc: Resume, opts: ViewOptions = {}, size?: PageSize): Promise<void> {
  const pageSize = size ?? doc.preferences?.pageSize ?? "A4";
  const vm = buildView(doc, opts);

  const host = document.createElement("div");
  host.id = "folio-print";
  document.body.appendChild(host);
  const style = document.createElement("style");
  style.textContent = `@page { size: ${PAGE[pageSize].css}; margin: ${PAGE.marginBlock}px ${PAGE.marginInline}px; }`;
  document.head.appendChild(style);
  const root = createRoot(host);
  flushSync(() => root.render(<ResumePage vm={vm} size={pageSize} />));

  const title = document.title;
  document.title = documentTitle(doc); // browsers use it as the PDF file name
  document.body.classList.add("folio-printing");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("folio-printing");
    document.title = title;
    root.unmount();
    host.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  try {
    await document.fonts.ready;
    // Let images (a photo) decode before the print snapshot.
    await Promise.all([...host.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
    window.print();
  } finally {
    // Most browsers block in print() and fire afterprint; this covers the rest.
    setTimeout(cleanup, 1000);
  }
}

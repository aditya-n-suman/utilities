import type { CSSProperties } from "react";
import type { PageSize } from "../lib/types";
import type { ResumeView } from "../lib/view";
import { Ledger } from "./Ledger";
import { Meridian } from "./Meridian";
import { Tracking } from "./Tracking";
import "./page.css";

const COMPONENTS = { meridian: Meridian, ledger: Ledger, tracking: Tracking } as const;

/** Page geometry in CSS px (96 per inch). The margin is the page padding on screen and the @page margin in print. */
export const PAGE = {
  A4: { width: 794, height: 1123, css: "A4" },
  Letter: { width: 816, height: 1056, css: "letter" },
  marginBlock: 44,
  marginInline: 48,
} as const;

export function TemplateBody({ vm }: { vm: ResumeView }) {
  const C = COMPONENTS[vm.template.id as keyof typeof COMPONENTS] ?? Meridian;
  return <C vm={vm} />;
}

/** One resume as a sheet of paper: page size, direction, language and accent tokens. */
export function ResumePage({ vm, size = "A4", className }: { vm: ResumeView; size?: PageSize; className?: string }) {
  const style = {
    "--accent": vm.accent,
    "--accent-soft": vm.accentSoft,
    "--on-accent": vm.onAccent,
    "--page-width": PAGE[size].width + "px",
    "--page-height": PAGE[size].height + "px",
    "--page-margin-block": PAGE.marginBlock + "px",
    "--page-margin-inline": PAGE.marginInline + "px",
  } as CSSProperties;
  return (
    <div className={"folio-page" + (className ? " " + className : "")} dir={vm.dir} lang={vm.lang} style={style} data-template={vm.template.id}>
      <TemplateBody vm={vm} />
    </div>
  );
}

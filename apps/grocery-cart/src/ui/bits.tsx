// Small pieces shared by the screens.

import { useState } from "react";
import type { Mode } from "../engine/jiomart/api.ts";
import type { Candidate, Confidence } from "../engine/match.ts";
import { rupees } from "./format.ts";

export function Thumb({ src, size }: { src?: string; size: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (!src || broken) return <div className="thumb" style={style} role="img" aria-label="No product image" />;
  return <img className="thumb" style={style} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

export function MatchChip({ confidence }: { confidence: Confidence }) {
  if (confidence === "high") return <span className="chip good">Good match</span>;
  if (confidence === "none") return <span className="chip none">Not found</span>;
  return <span className="chip check">Check this</span>;
}

export const MODE_LABEL: Record<Mode, string> = { quick: "Quick", all: "Shop all" };

export function Yours({ query, qtyText, note }: { query: string; qtyText: string; note?: string }) {
  return (
    <div className="yours" role="cell">
      <div className="q">
        <span className="name">{query}</span>
        <span className="qty">{qtyText}</span>
      </div>
      {note && (
        <span className="note" lang="hi">
          {note}
        </span>
      )}
    </div>
  );
}

export function Copy({ text, label = "Copy", className = "btn-s" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={className}
      style={{ fontWeight: 600 }}
      onClick={() => {
        void navigator.clipboard?.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function Cmd() {
  return (
    <div className="cmd">
      <code>./instruction.sh chrome</code>
      <Copy text="./instruction.sh chrome" />
    </div>
  );
}

export function perUnit(c: Candidate): string {
  const p = c.pricePerUnit;
  if (!p) return "price per unit unknown";
  return p.per === "pack" ? "per pack" : `${rupees(p.value)}/${p.per}`;
}

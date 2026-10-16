import { Fragment } from "react";

// The schema's inline markup: **bold**, *italic*, [label](https://url).
// Anything else is text; React escapes it, so pasted HTML shows literally.

export interface Seg {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

const RE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g;

export function parseInline(text: string | undefined): Seg[] {
  if (!text) return [];
  const out: Seg[] = [];
  let i = 0;
  for (const m of text.matchAll(RE)) {
    const at = m.index ?? 0;
    if (at > i) out.push({ text: text.slice(i, at) });
    if (m[1]) out.push({ text: m[1], bold: true });
    else if (m[2]) out.push({ text: m[2], italic: true });
    else out.push({ text: m[3], href: m[4] });
    i = at + m[0].length;
  }
  if (i < text.length) out.push({ text: text.slice(i) });
  return out;
}

export const plainText = (segs: Seg[]) => segs.map((s) => s.text).join("");

export function Rich({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) => {
        if (s.href) return <a key={i} href={s.href}>{s.text}</a>;
        if (s.bold) return <strong key={i}>{s.text}</strong>;
        if (s.italic) return <em key={i}>{s.text}</em>;
        return <Fragment key={i}>{s.text}</Fragment>;
      })}
    </>
  );
}

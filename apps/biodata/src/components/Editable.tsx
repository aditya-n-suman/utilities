import { useLayoutEffect, useRef, type CSSProperties } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Single-line fields commit on Enter; multi-line fields (the preference paragraph) keep it. */
  multiline?: boolean;
  as?: "div" | "span";
  style?: CSSProperties;
}

/**
 * Click-to-edit text. The DOM owns the text while it is being typed; React only writes it when the
 * value changes from outside (load, reset), so the caret never jumps.
 */
export default function Editable({ value, onChange, multiline, as: Tag = "div", style }: Props) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.innerText !== value) el.innerText = value;
  }, [value]);

  return (
    <Tag
      ref={ref as never}
      contentEditable="plaintext-only"
      spellCheck={false}
      style={style}
      onBlur={(e) => {
        const v = e.currentTarget.innerText.replace(/\n+$/, "");
        if (v !== value) onChange(v);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

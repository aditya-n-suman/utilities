import { useEffect, useRef } from "react";
import { errorCopy, type ErrorAction } from "../copy";

interface Props {
  code: string | null;
  onAction: (action: ErrorAction) => void;
}

export function ErrorScreen({ code, onAction }: Props) {
  const e = errorCopy(code);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [code]);

  return (
    <section role="alert" aria-labelledby="err-h" className="card error-card">
      <span aria-hidden="true" className={`error-icon ${e.tone}`}>
        {e.icon}
      </span>
      <h1 id="err-h" ref={heading} tabIndex={-1} style={{ outline: "none" }}>
        {e.title}
      </h1>
      <p>{e.body}</p>
      <div className="error-btns">
        <button type="button" className="btn btn-primary" onClick={() => onAction(e.primary[1])}>
          {e.primary[0]}
        </button>
        {e.secondary && (
          <button type="button" className="btn btn-outline" onClick={() => onAction(e.secondary![1])}>
            {e.secondary[0]}
          </button>
        )}
      </div>
    </section>
  );
}

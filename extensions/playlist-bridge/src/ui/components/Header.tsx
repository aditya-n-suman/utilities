import { useEffect, useRef, useState } from "react";
import { helpUrl, reportProblemUrl, version } from "@/platform/links";
import type { Release } from "@/platform/updates";

interface Props {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onHome: () => void;
  showStartOver: boolean;
  accessOk: boolean;
  onAllowAccess: () => void;
  onClearCache: () => Promise<void>;
  update: Release | null;
}

export function Header({ theme, onToggleTheme, onHome, showStartOver, accessOk, onAllowAccess, onClearCache, update }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="header">
      <button type="button" className="brand" onClick={onHome} aria-label="Playlist Bridge, start over">
        <span aria-hidden="true" className="brand-mark">
          <span className="brand-dot" style={{ background: "var(--green)" }} />
          <span className="brand-line" />
          <span className="brand-dot" style={{ background: "var(--red)" }} />
        </span>
        <span className="brand-name">Playlist Bridge</span>
      </button>
      <div className="header-actions">
        {update && (
          <a className="pill update-pill" href={update.url} target="_blank" rel="noopener noreferrer">
            Update to {update.version}
          </a>
        )}
        {showStartOver && (
          <button type="button" className="pill" onClick={onHome}>
            Start over
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label="About and settings"
          aria-haspopup="dialog"
          aria-expanded={open}
          style={{ fontSize: 16, lineHeight: 1 }}
        >
          ⋯
        </button>
        {open && (
          <Settings
            accessOk={accessOk}
            onAllowAccess={onAllowAccess}
            onClearCache={onClearCache}
            onClose={() => setOpen(false)}
            update={update}
          />
        )}
      </div>
    </header>
  );
}

function Settings({
  accessOk,
  onAllowAccess,
  onClearCache,
  onClose,
  update,
}: {
  accessOk: boolean;
  onAllowAccess: () => void;
  onClearCache: () => Promise<void>;
  onClose: () => void;
  update: Release | null;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [clear, setClear] = useState<"idle" | "confirm" | "done">("idle");

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dialog.current && !dialog.current.contains(target) && !(target as Element).closest?.("[aria-label='About and settings']")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-labelledby="set-h" tabIndex={-1} ref={dialog} className="settings">
      <div className="settings-top">
        <div>
          <h2 id="set-h">Playlist Bridge</h2>
          <p className="mono settings-version">Version {version()}</p>
          {update && (
            <p className="settings-update">
              Version {update.version} is out.{" "}
              <a href={update.url} target="_blank" rel="noopener noreferrer">
                Download it
              </a>
              , then replace the files in your Playlist Bridge folder and click reload in the extensions page.
            </p>
          )}
        </div>
        <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="settings-row">
        {accessOk ? (
          <span>
            Site access: allowed <span className="ok">✓</span>
          </span>
        ) : (
          <>
            <span>Site access: off</span>
            <button type="button" className="btn btn-primary settings-small" onClick={onAllowAccess}>
              Allow access
            </button>
          </>
        )}
      </div>
      {clear === "idle" && (
        <button type="button" className="btn btn-outline settings-clear" onClick={() => setClear("confirm")}>
          Clear saved matches (cache)
        </button>
      )}
      {clear === "confirm" && (
        <div role="alertdialog" aria-label="Confirm clearing saved matches" className="settings-confirm">
          <p>Clear saved matches? Conversions you haven’t saved will be lost.</p>
          <div>
            <button type="button" className="danger" onClick={() => void onClearCache().then(() => setClear("done"))}>
              Clear
            </button>
            <button type="button" className="cancel" onClick={() => setClear("idle")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {clear === "done" && (
        <p role="status" className="settings-done">
          Saved matches cleared <span className="ok">✓</span>
        </p>
      )}
      <div className="settings-links">
        <a href={helpUrl()} target="_blank" rel="noopener noreferrer">
          How it works
        </a>
        <a href={reportProblemUrl()} target="_blank" rel="noopener noreferrer">
          Report a problem
        </a>
      </div>
    </div>
  );
}

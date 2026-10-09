interface Props {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onHome: () => void;
  showStartOver: boolean;
}

export function Header({ theme, onToggleTheme, onHome, showStartOver }: Props) {
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
      </div>
    </header>
  );
}

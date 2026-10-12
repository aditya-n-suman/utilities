import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { SAMPLE_DUMP, SAMPLE_NAME } from "../sample";
import { BracesIcon, ChevronRight, ClipboardIcon, FileIcon, IncludeIcon, LockIcon, SearchIcon, UploadIcon } from "./Icons";

interface Props {
  onOpen: (text: string, name: string, size: number) => void;
  error: string | null;
  onError: (message: string | null) => void;
}

/** True when the start of the file holds NUL bytes, i.e. it is not plain text. */
function looksBinary(text: string): boolean {
  return text.slice(0, 65536).includes("\u0000");
}

export default function Upload({ onOpen, error, onError }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);

  const readFile = async (file: File) => {
    setReading(true);
    try {
      const text = await file.text();
      if (looksBinary(text)) onError(`"${file.name}" is not a plain-text file.`);
      else onOpen(text, file.name, file.size);
    } catch {
      onError(`Could not read "${file.name}".`);
    } finally {
      setReading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void readFile(file);
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo logo-lg">
            <BracesIcon size={20} />
          </span>
          <span className="brand-text">
            <span className="brand-name">nginx -T Explorer</span>
            <span className="brand-tag">Fold, follow and search the whole effective config</span>
          </span>
        </div>
        <span className="privacy">
          <LockIcon />
          Runs in your browser. The file never leaves your machine.
        </span>
      </header>

      <main className="landing">
        <div className="hero">
          <h1>Read a 5,000-line nginx dump one block at a time.</h1>
          <p>
            Open the output of <code className="chip">nginx -T</code>. Every <code>{"{ }"}</code> block folds like a
            JSON viewer, and every <code>include</code> opens in place, so you see only the part you are working on.
          </p>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {!pasting ? (
          <section
            aria-label="Open a file"
            className={"dropzone" + (dragging ? " is-dragging" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="drop-icon">
              <UploadIcon size={30} />
            </span>
            <div className="drop-text">
              <h2>{reading ? "Reading…" : "Drop your nginx -T output here"}</h2>
              <p>
                Any plain-text file: <span className="mono">.txt</span>, <span className="mono">.log</span>,{" "}
                <span className="mono">.conf</span>, or no extension at all. A single nginx.conf works too.
              </p>
            </div>
            <div className="drop-actions">
              <input
                ref={input}
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                  e.target.value = "";
                }}
              />
              <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
                <FileIcon />
                Choose file
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onError(null);
                  setPasting(true);
                }}
              >
                <ClipboardIcon />
                Paste text
              </button>
              <button type="button" className="btn-link" onClick={() => onOpen(SAMPLE_DUMP, SAMPLE_NAME, SAMPLE_DUMP.length)}>
                Try a sample config
              </button>
            </div>
          </section>
        ) : (
          <section aria-label="Paste text" className="paste">
            <label htmlFor="paste-box">Paste the output of nginx -T</label>
            <textarea
              id="paste-box"
              rows={12}
              autoFocus
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={
                "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n# configuration file /etc/nginx/nginx.conf:\nuser www-data;\n…"
              }
            />
            <div className="paste-actions">
              <button type="button" className="btn" onClick={() => setPasting(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pasted.trim() === ""}
                onClick={() => onOpen(pasted, "pasted text", new Blob([pasted]).size)}
              >
                Explore
              </button>
            </div>
          </section>
        )}

        <div className="cards">
          <section className="card">
            <h3>Get the file</h3>
            <p className="muted">Run one of these where nginx lives. It prints the test result and then every config file it loaded.</p>
            <pre className="terminal">
              <span className="prompt">$</span> sudo nginx -T &gt; nginx-full.txt{"\n"}
              <span className="prompt">$</span> docker exec web nginx -T &gt; nginx-full.txt{"\n"}
              <span className="prompt">$</span> kubectl exec deploy/web -- nginx -T &gt; nginx-full.txt
            </pre>
          </section>
          <section className="card">
            <h3>What you get</h3>
            <Feature icon={<ChevronRight />} title="Fold any block">
              http, server, location, upstream. Collapsed blocks still show their listen and server_name.
            </Feature>
            <Feature icon={<IncludeIcon />} title="Follow includes in place">
              See conf.d and sites-enabled where nginx reads them, or browse file by file.
            </Feature>
            <Feature icon={<SearchIcon size={18} />} title="Search everything">
              Matches open their parent blocks; step through them with Enter.
            </Feature>
          </section>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="feature">
      <span className="feature-icon">{icon}</span>
      <span className="feature-text">
        <strong>{title}</strong>
        <span className="muted">{children}</span>
      </span>
    </div>
  );
}

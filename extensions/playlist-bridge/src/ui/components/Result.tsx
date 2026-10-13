import { api, type Counts, type TempLinks } from "../api";
import { useCopy } from "../copy";
import { SaveCard } from "./SaveCard";

interface Props {
  jobId: string;
  playlistName: string;
  links: TempLinks;
  counts: Counts;
  announce: (msg: string) => void;
}

export function Result({ jobId, playlistName, links, counts: c, announce }: Props) {
  const { copied, copy } = useCopy(announce);
  const split = links.links.length > 1;
  const sizes = links.links.map((l) => new URL(l.url).searchParams.get("video_ids")?.split(",").length ?? 0);
  const perLink = Math.max(...sizes);
  const matched = c.high + c.medium + c.low;

  return (
    <section aria-labelledby="res-h" className="result">
      <div className="card ready">
        <div aria-hidden="true" className="ready-edge" />
        <p className="eyebrow">
          {playlistName} · {links.video_count} VIDEOS
        </p>
        <h1 id="res-h">Your YouTube playlist is ready</h1>
        {split && (
          <p className="ready-note">
            Quick playlists hold up to {perLink} videos, so yours is split into {links.links.length} parts. Save it to your
            account to keep everything in one playlist.
          </p>
        )}
        <div className="parts">
          {links.links.map((l, i) => {
            const n = sizes[i];
            const key = `part${l.part}`;
            return (
              <div key={l.part} className="part">
                {split && (
                  <span className="part-label">
                    Part {l.part} of {l.of}
                  </span>
                )}
                <span className="part-count">{n} videos</span>
                <div className="part-btns">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    aria-label={split ? `Open part ${l.part} of ${l.of} on YouTube` : "Open on YouTube"}
                  >
                    Open on YouTube ↗
                  </a>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => copy(l.url, key)}
                    aria-label={split ? `Copy link to part ${l.part}` : "Copy playlist link"}
                  >
                    {copied === key ? "Copied ✓" : "Copy link"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="result-grid">
        <SaveCard jobId={jobId} title={playlistName} videoCount={links.video_count} announce={announce} copied={copied} copy={copy} />
        <div className="card side-card">
          <h2 className="summary-h">Summary</h2>
          <dl className="stats">
            <div className="stat hi">
              <dt>Matched</dt>
              <dd>{matched}</dd>
            </div>
            <div className="stat">
              <dt>Skipped</dt>
              <dd>{c.removed + c.error}</dd>
            </div>
            <div className="stat nf">
              <dt>Not found</dt>
              <dd>{c.not_found}</dd>
            </div>
          </dl>
          <p className="split">
            {c.high} high · {c.medium} medium · {c.low} low
          </p>
          <button type="button" className="csv" onClick={() => void api.downloadReport(jobId).catch(() => announce("Couldn’t build the report"))}>
            ↓ Download match report (CSV)
          </button>
        </div>
      </div>
    </section>
  );
}

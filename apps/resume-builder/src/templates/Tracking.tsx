// Tracking: letter-spaced caps name, tagline and headings, skills as a
// label/value table, dates on the end edge, promotions grouped under one
// company. ATS-safe. From the owner's letter-spaced reference.
// Design: design/TplTracking.dc.html.

import type { ReactNode } from "react";
import { Rich } from "../lib/markup";
import type { ResumeView, Section, WorkView } from "../lib/view";
import { BulletItem, InlineLinks, MaybeLink } from "./parts";
import "./tracking.css";

export function Tracking({ vm }: { vm: ResumeView }) {
  return (
    <div className="tpl trk">
      <header className="trk-head">
        <h1 data-path="basics.name">{vm.name}</h1>
        {vm.headline && (
          <div className="trk-headline" data-path="basics.headline">
            {vm.headline}
          </div>
        )}
        <div className="trk-links">
          <InlineLinks links={vm.links} sep=" • " sepClass="trk-sep" />
        </div>
        {vm.extras.length > 0 && (
          <div className="trk-extras">
            {vm.extras.map((x, i) => (
              <span key={x.path}>
                <span data-path={x.path}>
                  {x.label}: {x.value}
                </span>
                {i < vm.extras.length - 1 && " • "}
              </span>
            ))}
          </div>
        )}
      </header>
      {vm.sections.map((s) => (
        <section key={s.key} className="trk-sec">
          <h2 data-path={s.path}>{s.title}</h2>
          <SectionBody s={s} vm={vm} />
        </section>
      ))}
    </div>
  );
}

/** A line with content at the start edge and a date at the end edge. */
function Row({ children, end, endPath }: { children: ReactNode; end?: string; endPath?: string }) {
  return (
    <div className="trk-row">
      <div className="trk-min">{children}</div>
      {end && (
        <div className="trk-end" data-path={endPath}>
          {end}
        </div>
      )}
    </div>
  );
}

function RoleBody({ w, vm }: { w: WorkView; vm: ResumeView }) {
  return (
    <>
      {w.bullets.length > 0 && (
        <ul>
          {w.bullets.map((b) => (
            <BulletItem key={b.path} b={b} />
          ))}
        </ul>
      )}
      {w.tech.length > 0 && (
        <div className="trk-tech" data-path={`${w.path}.technologies`}>
          {vm.labels.tech}: {w.tech.join(", ")}
        </div>
      )}
    </>
  );
}

function SectionBody({ s, vm }: { s: Section; vm: ResumeView }) {
  switch (s.kind) {
    case "summary":
      return (
        <p data-path="basics.summary">
          <Rich segs={s.segs} />
        </p>
      );
    case "skills":
      return (
        <div className="trk-skills">
          {s.groups.map((g) => (
            <div key={g.path} data-path={g.path} className="trk-skill-row">
              <div className="trk-strong">{g.name}</div>
              <div>{g.joined}</div>
            </div>
          ))}
        </div>
      );
    case "work":
      return (
        <>
          {s.groups.map((g) => {
            if (g.roles.length === 1) {
              const w = g.roles[0];
              return (
                <div key={g.path} className="trk-group">
                  <article data-path={w.path} className="trk-avoid">
                    <Row end={w.dates} endPath={`${w.path}.dates`}>
                      <span className="trk-strong" data-path={`${w.path}.title`}>
                        {w.title}
                      </span>
                      <span className="trk-dash"> — </span>
                      <span className="trk-strong" data-path={`${w.path}.company`}>
                        {w.company}
                      </span>
                      {w.context && <span data-path={`${w.path}.context`}> | {w.context}</span>}
                    </Row>
                    {w.where && (
                      <div className="trk-where" data-path={`${w.path}.location`}>
                        {w.where}
                      </div>
                    )}
                    {w.summary && (
                      <p className="trk-summary">
                        <Rich segs={w.summary} />
                      </p>
                    )}
                    <RoleBody w={w} vm={vm} />
                  </article>
                </div>
              );
            }
            return (
              <div key={g.path} className="trk-group">
                <div className="trk-row trk-keep" data-path={`${g.path}.company`}>
                  <div>
                    <span className="trk-strong">{g.company}</span>
                    {g.context && <span> | {g.context}</span>}
                    {g.where && <span className="trk-where-inline"> · {g.where}</span>}
                  </div>
                  <div className="trk-end">{g.dates}</div>
                </div>
                {g.roles.map((w) => (
                  <article key={w.path} data-path={w.path} className="trk-role">
                    <div className="trk-row">
                      <span className="trk-role-title" data-path={`${w.path}.title`}>
                        {w.title}
                      </span>
                      <span className="trk-end trk-muted" data-path={`${w.path}.dates`}>
                        {w.dates}
                      </span>
                    </div>
                    {w.summary && (
                      <p className="trk-summary">
                        <Rich segs={w.summary} />
                      </p>
                    )}
                    <RoleBody w={w} vm={vm} />
                  </article>
                ))}
              </div>
            );
          })}
        </>
      );
    case "education":
      return (
        <>
          {s.items.map((e) => {
            const extra = [e.score?.line, e.honors, e.courses.join(", ")].filter(Boolean).join(" · ");
            return (
              <article key={e.path} data-path={e.path} className="trk-item">
                <Row end={e.dates} endPath={`${e.path}.dates`}>
                  {e.degreeLine && (
                    <>
                      <span className="trk-strong" data-path={`${e.path}.degree`}>
                        {e.degreeLine}
                      </span>
                      <span className="trk-dash"> — </span>
                    </>
                  )}
                  <span data-path={`${e.path}.institution`}>{e.institution}</span>
                </Row>
                {extra && (
                  <div className="trk-note" data-path={e.score ? `${e.path}.score` : undefined}>
                    {extra}
                  </div>
                )}
              </article>
            );
          })}
        </>
      );
    case "projects":
      return (
        <>
          {s.items.map((pr) => (
            <article key={pr.path} data-path={pr.path} className="trk-item trk-project">
              <div className="trk-row">
                <div>
                  <span className="trk-strong" data-path={`${pr.path}.name`}>
                    {pr.name}
                  </span>
                  {pr.kind && <span className="trk-dash"> — {pr.kind}</span>}
                </div>
                {pr.link && (
                  <div className="trk-end trk-note" data-path={pr.link.path} dir="ltr">
                    <MaybeLink href={pr.link.href}>{pr.link.text}</MaybeLink>
                  </div>
                )}
              </div>
              {pr.desc && (
                <div data-path={`${pr.path}.description`}>
                  <Rich segs={pr.desc} />
                  {pr.tech.length > 0 && <span className="trk-note-color"> ({pr.tech.join(", ")})</span>}
                </div>
              )}
              {pr.bullets.length > 0 && (
                <ul>
                  {pr.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                </ul>
              )}
            </article>
          ))}
        </>
      );
    case "certifications":
      return (
        <>
          {s.items.map((c) => (
            <div key={c.path} data-path={c.path}>
              <Row end={c.date}>
                <span className="trk-strong">{c.name}</span>
                {c.issuer && ` — ${c.issuer}`}
              </Row>
            </div>
          ))}
        </>
      );
    case "awards":
      return (
        <>
          {s.items.map((a) => (
            <div key={a.path} data-path={a.path} className="trk-avoid">
              <Row end={a.date}>
                <span className="trk-strong">{a.title}</span>
                {a.awarder && ` — ${a.awarder}`}
              </Row>
              {a.summary && (
                <div className="trk-note">
                  <Rich segs={a.summary} />
                </div>
              )}
            </div>
          ))}
        </>
      );
    case "publications":
      return (
        <>
          {s.items.map((pb) => (
            <div key={pb.path} data-path={pb.path} className="trk-avoid trk-pub">
              <Row end={pb.date}>
                <span className="trk-strong">{pb.title}</span>
              </Row>
              <div className="trk-note">
                {pb.authors.map((a, i) => (
                  <span key={i}>
                    {a.isOwner ? <strong>{a.name}</strong> : a.name}
                    {i < pb.authors.length - 1 && ", "}
                  </span>
                ))}
                {pb.venue && (
                  <>
                    {pb.authors.length > 0 && " · "}
                    <em>{pb.venue}</em>
                  </>
                )}
              </div>
            </div>
          ))}
        </>
      );
    case "languages":
      return <p data-path="languages">{s.joined}</p>;
    case "interests":
      return <p data-path="interests">{s.joined}</p>;
    case "volunteer":
      return (
        <>
          {s.items.map((v) => (
            <div key={v.path} data-path={v.path} className="trk-avoid">
              <Row end={v.dates}>
                {v.role && (
                  <>
                    <span className="trk-strong">{v.role}</span> —{" "}
                  </>
                )}
                {v.organization}
              </Row>
              {v.summary && (
                <div className="trk-note">
                  <Rich segs={v.summary} />
                </div>
              )}
              {v.bullets.length > 0 && (
                <ul>
                  {v.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      );
    case "references":
      return (
        <>
          {s.onRequest && <p data-path="references">{s.text}</p>}
          {s.items.map((r) => (
            <div key={r.path} data-path={r.path}>
              <span className="trk-strong">{r.name}</span>
              {r.line && ` — ${r.line}`}
            </div>
          ))}
        </>
      );
    case "custom":
      if (s.display === "bullets")
        return (
          <ul>
            {s.items.map((it) => (
              <li key={it.path} data-path={it.path}>
                {it.title}
              </li>
            ))}
          </ul>
        );
      if (s.display === "tags")
        return (
          <p>
            {s.items.map((it, i) => (
              <span key={it.path} data-path={it.path}>
                {it.title}
                {i < s.items.length - 1 && " • "}
              </span>
            ))}
          </p>
        );
      if (s.display === "text")
        return (
          <>
            {s.items.map((it) => (
              <p key={it.path} className="trk-para" data-path={it.path}>
                {it.desc && <Rich segs={it.desc} />}
              </p>
            ))}
          </>
        );
      return (
        <>
          {s.items.map((it) => (
            <div key={it.path} data-path={it.path} className="trk-avoid trk-pub">
              <Row end={it.dates}>
                <span className="trk-strong">{it.title}</span>
                {it.meta && ` — ${it.meta}`}
              </Row>
              {it.desc && (
                <div className="trk-note">
                  <Rich segs={it.desc} />
                </div>
              )}
              {it.bullets.length > 0 && (
                <ul>
                  {it.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      );
  }
}

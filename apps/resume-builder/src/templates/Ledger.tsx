// Ledger: classic single column, centred name, pipe-separated lines,
// "Company | Title" entries, skills as "Group: a, b, c" bullets. ATS-safe.
// From the owner's single-column reference. Design: design/TplLedger.dc.html.

import { Rich } from "../lib/markup";
import type { ResumeView, Section } from "../lib/view";
import { BulletItem, InlineLinks, MaybeLink } from "./parts";
import "./ledger.css";

export function Ledger({ vm }: { vm: ResumeView }) {
  return (
    <div className="tpl led">
      <header className="led-head">
        <h1 data-path="basics.name">{vm.name}</h1>
        {vm.headline && (
          <div className="led-headline" data-path="basics.headline">
            {vm.headline}
          </div>
        )}
        <div className="led-links">
          <InlineLinks links={vm.links} sep=" | " sepClass="led-sep" />
        </div>
        {vm.extras.length > 0 && (
          <div className="led-extras">
            {vm.extras.map((x, i) => (
              <span key={x.path}>
                <span data-path={x.path}>
                  {x.label}: {x.value}
                </span>
                {i < vm.extras.length - 1 && " | "}
              </span>
            ))}
          </div>
        )}
      </header>
      {vm.sections.map((s) => (
        <section key={s.key} className="led-sec">
          <h2 data-path={s.path}>{s.title}</h2>
          <SectionBody s={s} vm={vm} />
        </section>
      ))}
    </div>
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
        <ul>
          {s.groups.map((g) => (
            <li key={g.path} data-path={g.path}>
              {g.name && <strong>{g.name}: </strong>}
              {g.joined}
            </li>
          ))}
        </ul>
      );
    case "work":
      return (
        <>
          {s.items.map((w) => (
            <article key={w.path} className="led-entry" data-path={w.path}>
              <div className="led-strong">
                <span data-path={`${w.path}.company`}>{w.company}</span>
                {w.context && (
                  <span className="led-normal" data-path={`${w.path}.context`}>
                    {" "}| {w.context}
                  </span>
                )}
                {" | "}
                <span data-path={`${w.path}.title`}>{w.title}</span>
              </div>
              <div className="led-meta">
                {w.where && (
                  <>
                    <span data-path={`${w.path}.location`}>{w.where}</span>
                    {" | "}
                  </>
                )}
                <span data-path={`${w.path}.dates`}>{w.dates}</span>
              </div>
              {w.summary && (
                <p className="led-summary" data-path={`${w.path}.summary`}>
                  <Rich segs={w.summary} />
                </p>
              )}
              {(w.bullets.length > 0 || w.tech.length > 0) && (
                <ul>
                  {w.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                  {w.tech.length > 0 && (
                    <li data-path={`${w.path}.technologies`}>
                      <strong>{vm.labels.tech}: </strong>
                      {w.tech.join(", ")}
                    </li>
                  )}
                </ul>
              )}
            </article>
          ))}
        </>
      );
    case "education":
      return (
        <>
          {s.items.map((e) => (
            <article key={e.path} className="led-entry led-tight" data-path={e.path}>
              <div>
                <strong data-path={`${e.path}.institution`}>{e.institution}</strong>
                {e.degreeLine && (
                  <>
                    {" | "}
                    <span data-path={`${e.path}.degree`}>{e.degreeLine}</span>
                  </>
                )}
              </div>
              <div className="led-meta">
                {[
                  e.location && <span key="l">{e.location}</span>,
                  e.dates && (
                    <span key="d" data-path={`${e.path}.dates`}>
                      {e.dates}
                    </span>
                  ),
                  e.score && (
                    <span key="s" data-path={`${e.path}.score`}>
                      {e.score.line}
                    </span>
                  ),
                  e.honors && <span key="h">{e.honors}</span>,
                ]
                  .filter(Boolean)
                  .map((node, i) => (
                    <span key={i}>
                      {i > 0 && " | "}
                      {node}
                    </span>
                  ))}
              </div>
              {e.courses.length > 0 && <div className="led-meta-size">Courses: {e.courses.join(", ")}</div>}
            </article>
          ))}
        </>
      );
    case "projects":
      return (
        <>
          {s.items.map((pr) => (
            <article key={pr.path} className="led-entry led-project" data-path={pr.path}>
              <div>
                <strong data-path={`${pr.path}.name`}>{pr.name}</strong>
                {pr.kind && ` (${pr.kind})`}
                {pr.link && (
                  <>
                    {" | "}
                    <span data-path={pr.link.path} dir="ltr">
                      <MaybeLink href={pr.link.href}>{pr.link.text}</MaybeLink>
                    </span>
                  </>
                )}
                {pr.dates && ` | ${pr.dates}`}
              </div>
              {(pr.desc || pr.bullets.length > 0 || pr.tech.length > 0) && (
                <ul>
                  {pr.desc && (
                    <li data-path={`${pr.path}.description`}>
                      <Rich segs={pr.desc} />
                    </li>
                  )}
                  {pr.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                  {pr.tech.length > 0 && (
                    <li>
                      <strong>{vm.labels.tech}: </strong>
                      {pr.tech.join(", ")}
                    </li>
                  )}
                </ul>
              )}
            </article>
          ))}
        </>
      );
    case "certifications":
      return (
        <ul>
          {s.items.map((c) => (
            <li key={c.path} data-path={c.path}>
              <strong>{c.name}</strong>
              {c.line && `, ${c.line}`}
            </li>
          ))}
        </ul>
      );
    case "awards":
      return (
        <ul>
          {s.items.map((a) => (
            <li key={a.path} data-path={a.path}>
              <strong>{a.title}</strong>
              {a.line && `, ${a.line}`}
              {a.summary && (
                <>
                  . <Rich segs={a.summary} />
                </>
              )}
            </li>
          ))}
        </ul>
      );
    case "publications":
      return (
        <>
          {s.items.map((pb) => (
            <div key={pb.path} className="led-pub" data-path={pb.path}>
              {pb.authors.length > 0 && (
                <>
                  {pb.authors.map((a, i) => (
                    <span key={i}>
                      {a.isOwner ? <strong>{a.name}</strong> : a.name}
                      {i < pb.authors.length - 1 && ", "}
                    </span>
                  ))}
                  .{" "}
                </>
              )}
              <em>{pb.title}</em>.{pb.line && ` ${pb.line}.`}
              {pb.link && (
                <>
                  {" "}
                  <span dir="ltr">
                    <MaybeLink href={pb.link.href}>{pb.link.text}</MaybeLink>
                  </span>
                </>
              )}
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
            <article key={v.path} className="led-entry led-tight" data-path={v.path}>
              <div className="led-strong">
                {v.organization}
                {v.role && ` | ${v.role}`}
              </div>
              <div className="led-meta">{v.dates}</div>
              {(v.summary || v.bullets.length > 0) && (
                <ul>
                  {v.summary && (
                    <li>
                      <Rich segs={v.summary} />
                    </li>
                  )}
                  {v.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                </ul>
              )}
            </article>
          ))}
        </>
      );
    case "references":
      return (
        <>
          {s.onRequest && <p data-path="references">{s.text}</p>}
          {s.items.map((r) => (
            <div key={r.path} className="led-entry" data-path={r.path}>
              <strong>{r.name}</strong>
              {r.line && `, ${r.line}`}
              {r.contact && (
                <>
                  {" | "}
                  <span dir="ltr">{r.contact}</span>
                </>
              )}
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
                {i < s.items.length - 1 && ", "}
              </span>
            ))}
          </p>
        );
      if (s.display === "text")
        return (
          <>
            {s.items.map((it) => (
              <p key={it.path} className="led-para" data-path={it.path}>
                {it.desc && <Rich segs={it.desc} />}
              </p>
            ))}
          </>
        );
      return (
        <>
          {s.items.map((it) => (
            <article key={it.path} className="led-entry led-tight" data-path={it.path}>
              <div>
                <strong>{it.title}</strong>
                {it.meta && ` | ${it.meta}`}
                {it.link && (
                  <>
                    {" | "}
                    <span dir="ltr">
                      <MaybeLink href={it.link.href}>{it.link.text}</MaybeLink>
                    </span>
                  </>
                )}
              </div>
              {it.dates && <div className="led-meta">{it.dates}</div>}
              {it.desc && (
                <div>
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
            </article>
          ))}
        </>
      );
  }
}

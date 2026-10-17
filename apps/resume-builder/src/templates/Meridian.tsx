// Meridian: two columns, bold caps headings on a thick rule, initials circle
// or photo top-end, skills as underlined chips. From the owner's two-column
// reference resume. Design: design/TplMeridian.dc.html.

import { Icon, ICONS } from "../lib/icons";
import { Rich } from "../lib/markup";
import type { ResumeView, Section } from "../lib/view";
import { BulletItem, MaybeLink } from "./parts";
import "./meridian.css";

export function Meridian({ vm }: { vm: ResumeView }) {
  return (
    <div className="tpl mer">
      <header className="mer-head">
        <div className="mer-id">
          <h1 data-path="basics.name">{vm.name}</h1>
          {vm.headline && (
            <div className="mer-headline" data-path="basics.headline">
              {vm.headline}
            </div>
          )}
          <div className="mer-contacts">
            {vm.contacts.map((c) => (
              <span key={c.path} data-path={c.path} className="mer-contact">
                <Icon d={c.icon} />
                <MaybeLink href={c.href} dir={c.dir}>
                  {c.text}
                </MaybeLink>
              </span>
            ))}
          </div>
        </div>
        {vm.slot === "initials" && (
          <div className="mer-avatar" data-path="basics.initials" aria-label={vm.name}>
            {vm.initials}
          </div>
        )}
        {vm.slot === "photo" && vm.photo && <img className="mer-avatar mer-photo" data-path="basics.photo" src={vm.photo.src} alt={vm.photo.alt} />}
      </header>
      <div className="mer-cols">
        <div className="mer-col" data-flow>
          {vm.main.map((s) => (
            <MeridianSection key={s.key} s={s} vm={vm} />
          ))}
        </div>
        <div className="mer-col" data-flow>
          {vm.side.map((s) => (
            <MeridianSection key={s.key} s={s} vm={vm} />
          ))}
          {vm.profiles.length > 0 && (
            <section className="mer-sec" data-path="basics.profiles">
              <h2>{vm.labels.online}</h2>
              {vm.profiles.map((p) => (
                <div key={p.path} className="mer-profile" data-path={p.path}>
                  <Icon d={p.icon} size={18} width={2} />
                  <div className="mer-min">
                    <div className="mer-profile-name">{p.name}</div>
                    <div className="mer-profile-url" dir="ltr">
                      <MaybeLink href={p.href}>{p.text}</MaybeLink>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function MeridianSection({ s, vm }: { s: Section; vm: ResumeView }) {
  return (
    <section className="mer-sec">
      <h2 data-path={s.path}>{s.title}</h2>
      <SectionBody s={s} vm={vm} />
    </section>
  );
}

function SectionBody({ s, vm }: { s: Section; vm: ResumeView }) {
  switch (s.kind) {
    case "summary":
      return (
        <p className="mer-text" data-path="basics.summary">
          <Rich segs={s.segs} />
        </p>
      );
    case "work":
      return (
        <>
          {s.items.map((w) => (
            <article key={w.path} className="mer-entry" data-path={w.path}>
              <div className="mer-title" data-path={`${w.path}.title`}>
                {w.title}
              </div>
              <div className="mer-org">
                <span data-path={`${w.path}.company`}>{w.company}</span>
                {w.context && (
                  <span className="mer-context" data-path={`${w.path}.context`}>
                    {" "}· {w.context}
                  </span>
                )}
              </div>
              <div className="mer-meta">
                <span data-path={`${w.path}.dates`}>
                  <Icon d={ICONS.cal} size={11} />
                  {w.dates}
                </span>
                {w.where && (
                  <span data-path={`${w.path}.location`}>
                    <Icon d={ICONS.pin} size={11} />
                    {w.where}
                  </span>
                )}
              </div>
              {w.summary && (
                <p className="mer-summary" data-path={`${w.path}.summary`}>
                  <Rich segs={w.summary} />
                </p>
              )}
              {w.bullets.length > 0 && (
                <ul className="mer-bullets">
                  {w.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                </ul>
              )}
              {w.tech.length > 0 && (
                <div className="mer-tech" data-path={`${w.path}.technologies`}>
                  <span className="mer-tech-label">{vm.labels.tech}: </span>
                  {w.tech.join(", ")}
                </div>
              )}
            </article>
          ))}
        </>
      );
    case "education":
      return (
        <>
          {s.items.map((e) => (
            <article key={e.path} className="mer-edu" data-path={e.path}>
              <div className="mer-min">
                {e.degreeLine && (
                  <div className="mer-edu-degree" data-path={`${e.path}.degree`}>
                    {e.degreeLine}
                  </div>
                )}
                <div className="mer-edu-inst" data-path={`${e.path}.institution`}>
                  {e.institution}
                </div>
                <div className="mer-meta">
                  {e.dates && <span data-path={`${e.path}.dates`}>{e.dates}</span>}
                  {e.location && (
                    <span>
                      <Icon d={ICONS.pin} size={11} />
                      {e.location}
                    </span>
                  )}
                </div>
                {e.honors && <div className="mer-honors">{e.honors}</div>}
              </div>
              {e.score && (
                <div className="mer-score" data-path={`${e.path}.score`}>
                  <div className="mer-score-label">{e.score.label}</div>
                  <div className="mer-score-value">
                    <span className="mer-score-num">{e.score.value}</span>
                    {e.score.max && <span className="mer-muted"> / {e.score.max}</span>}
                  </div>
                </div>
              )}
            </article>
          ))}
        </>
      );
    case "skills":
      return (
        <>
          {s.groups.map((g) => (
            <div key={g.path} className="mer-skill-group" data-path={g.path}>
              {g.name && <div className="mer-sub">{g.name}</div>}
              <div className="mer-chips">
                {g.items.map((k) => (
                  <span key={k.path} className="mer-chip" data-path={k.path} aria-label={k.label}>
                    {k.name}
                    {k.level && (
                      <span className="mer-dots" aria-hidden="true">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} className={n <= k.level! ? "on" : undefined} />
                        ))}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </>
      );
    case "projects":
      return (
        <>
          {s.items.map((pr) => (
            <article key={pr.path} className="mer-entry mer-project" data-path={pr.path}>
              <div className="mer-project-name" data-path={`${pr.path}.name`}>
                {pr.name}
                {pr.kind && <span className="mer-kind"> ({pr.kind})</span>}
              </div>
              {pr.desc && (
                <p className="mer-desc" data-path={`${pr.path}.description`}>
                  <Rich segs={pr.desc} />
                </p>
              )}
              {pr.bullets.length > 0 && (
                <ul className="mer-bullets">
                  {pr.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                </ul>
              )}
              {pr.tech.length > 0 && <div className="mer-small mer-muted">{pr.tech.join(", ")}</div>}
              {pr.link && (
                <div className="mer-small mer-muted" data-path={pr.link.path} dir="ltr">
                  <MaybeLink href={pr.link.href}>{pr.link.text}</MaybeLink>
                </div>
              )}
            </article>
          ))}
        </>
      );
    case "languages":
      return (
        <>
          {s.items.map((l) => (
            <div key={l.path} className="mer-lang" data-path={l.path}>
              <span className="mer-strong">{l.language}</span>
              <span className="mer-muted">{l.level}</span>
            </div>
          ))}
        </>
      );
    case "certifications":
      return (
        <>
          {s.items.map((c) => (
            <div key={c.path} className="mer-mini" data-path={c.path}>
              <div className="mer-strong">{c.name}</div>
              <div className="mer-small mer-muted">{c.line}</div>
            </div>
          ))}
        </>
      );
    case "awards":
      return (
        <>
          {s.items.map((a) => (
            <div key={a.path} className="mer-mini" data-path={a.path}>
              <div className="mer-strong">{a.title}</div>
              <div className="mer-small mer-muted">{a.line}</div>
              {a.summary && (
                <div className="mer-small">
                  <Rich segs={a.summary} />
                </div>
              )}
            </div>
          ))}
        </>
      );
    case "interests":
      return (
        <p className="mer-text">
          {s.items.map((x, i) => (
            <span key={x.path} data-path={x.path}>
              {x.name}
              {i < s.items.length - 1 && " · "}
            </span>
          ))}
        </p>
      );
    case "publications":
      return (
        <>
          {s.items.map((pb) => (
            <article key={pb.path} className="mer-entry" data-path={pb.path}>
              <div className="mer-strong">{pb.title}</div>
              {pb.authors.length > 0 && (
                <div className="mer-small">
                  {pb.authors.map((a, i) => (
                    <span key={i}>
                      {a.isOwner ? <strong>{a.name}</strong> : a.name}
                      {i < pb.authors.length - 1 && ", "}
                    </span>
                  ))}
                </div>
              )}
              <div className="mer-small mer-muted">{pb.line}</div>
              {pb.link && (
                <div className="mer-small mer-accent" dir="ltr">
                  <MaybeLink href={pb.link.href}>{pb.link.text}</MaybeLink>
                </div>
              )}
            </article>
          ))}
        </>
      );
    case "volunteer":
      return (
        <>
          {s.items.map((v) => (
            <article key={v.path} className="mer-entry" data-path={v.path}>
              {v.role && <div className="mer-strong">{v.role}</div>}
              <div className="mer-strong mer-accent">{v.organization}</div>
              <div className="mer-small mer-meta-text">{v.dates}</div>
              {v.summary && (
                <p className="mer-text">
                  <Rich segs={v.summary} />
                </p>
              )}
              {v.bullets.length > 0 && (
                <ul className="mer-bullets">
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
          {s.onRequest && (
            <p className="mer-text" data-path="references">
              {s.text}
            </p>
          )}
          {s.items.map((r) => (
            <div key={r.path} className="mer-mini" data-path={r.path}>
              <div className="mer-strong">{r.name}</div>
              <div className="mer-small mer-muted">{r.line}</div>
              <div className="mer-small mer-muted" dir="ltr">
                {r.contact}
              </div>
            </div>
          ))}
        </>
      );
    case "custom":
      if (s.display === "bullets")
        return (
          <ul className="mer-bullets">
            {s.items.map((it) => (
              <li key={it.path} data-path={it.path}>
                {it.title}
              </li>
            ))}
          </ul>
        );
      if (s.display === "tags")
        return (
          <div className="mer-chips">
            {s.items.map((it) => (
              <span key={it.path} className="mer-chip" data-path={it.path}>
                {it.title}
              </span>
            ))}
          </div>
        );
      if (s.display === "text")
        return (
          <>
            {s.items.map((it) => (
              <p key={it.path} className="mer-text mer-para" data-path={it.path}>
                {it.desc && <Rich segs={it.desc} />}
              </p>
            ))}
          </>
        );
      return (
        <>
          {s.items.map((it) => (
            <article key={it.path} className="mer-entry" data-path={it.path}>
              <div className="mer-strong">{it.title}</div>
              {it.meta && <div className="mer-strong mer-accent">{it.meta}</div>}
              {it.dates && <div className="mer-small mer-meta-text">{it.dates}</div>}
              {it.desc && (
                <p className="mer-desc">
                  <Rich segs={it.desc} />
                </p>
              )}
              {it.bullets.length > 0 && (
                <ul className="mer-bullets">
                  {it.bullets.map((b) => (
                    <BulletItem key={b.path} b={b} />
                  ))}
                </ul>
              )}
              {it.link && (
                <div className="mer-small mer-muted" dir="ltr">
                  <MaybeLink href={it.link.href}>{it.link.text}</MaybeLink>
                </div>
              )}
            </article>
          ))}
        </>
      );
  }
}

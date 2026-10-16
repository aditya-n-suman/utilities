import type { ReactNode } from "react";
import { Rich } from "../lib/markup";
import type { Bullet, Contact } from "../lib/view";

/** A link in the PDF when there's an href, plain text otherwise. */
export function MaybeLink({ href, children, dir }: { href?: string; children: ReactNode; dir?: "ltr" | "auto" }) {
  return href ? (
    <a href={href} dir={dir}>
      {children}
    </a>
  ) : (
    <span dir={dir}>{children}</span>
  );
}

export function BulletItem({ b }: { b: Bullet }) {
  return (
    <li data-path={b.path}>
      {b.label && <strong className="lead">{b.label}: </strong>}
      <Rich segs={b.segs} />
    </li>
  );
}

/** Contacts on one line with a separator, using each contact's short form. */
export function InlineLinks({ links, sep, sepClass }: { links: Contact[]; sep: string; sepClass?: string }) {
  return (
    <>
      {links.map((c, i) => (
        <span key={c.path}>
          <span data-path={c.path}>
            <MaybeLink href={c.href} dir={c.dir}>
              {c.short}
            </MaybeLink>
          </span>
          {i < links.length - 1 && <span className={sepClass}>{sep}</span>}
        </span>
      ))}
    </>
  );
}

/** Join items with a separator, keeping each item's data-path. */
export function Joined<T extends { path: string }>({ items, sep, render }: { items: T[]; sep: string; render: (x: T) => ReactNode }) {
  return (
    <>
      {items.map((x, i) => (
        <span key={x.path} data-path={x.path}>
          {render(x)}
          {i < items.length - 1 && sep}
        </span>
      ))}
    </>
  );
}

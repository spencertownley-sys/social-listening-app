import Link from "next/link";

/** Shared layout for the privacy, cookie and terms pages: plain, readable, uses the site tokens. */
export function LegalPage({ title, updated, children, draft }: { title: string; updated: string; children: React.ReactNode; draft?: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-sm leading-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted">Last updated: {updated}</p>
        {draft && <p className="card border-dashed text-muted">{draft}</p>}
      </header>
      {children}
    </article>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-2 scroll-mt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[32rem] border-collapse bg-surface text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="border-b border-line px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className="border-b border-line px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Visible marker for facts only the owner can supply. */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-mix/25 px-1 text-foreground">[PLACEHOLDER: {children}]</mark>;
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  return href.startsWith("/") ? (
    <Link href={href} className="text-accent underline underline-offset-2">
      {children}
    </Link>
  ) : (
    <a href={href} className="text-accent underline underline-offset-2">
      {children}
    </a>
  );
}

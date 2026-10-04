import type { ReactNode } from 'react';
import { ArrowUpRight, Beaker } from 'lucide-react';
import { citeShort } from './lib';
import type { Citation } from './types';

export function Source({ citation }: { citation: Citation }) {
  const label = `${citeShort(citation)} · ${citation.year ?? 'n.d.'}`;
  if (!citation.url) {
    return (
      <span className="source" title={citation.identifier}>
        {label} · {citation.identifier}
      </span>
    );
  }
  return (
    <a className="source" href={citation.url} target="_blank" rel="noreferrer">
      {label}
      <ArrowUpRight size={13} />
    </a>
  );
}

export function Tag({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={'tag ' + tone}>{children}</span>;
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Beaker size={20} />
      <p>{text}</p>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

import { useState } from 'react';
import './ContextPanel.scss';

function Card({ title, summary, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`co-card ${open ? 'co-card--open' : ''}`}>
      <button type="button" className="co-card__head" onClick={() => setOpen((v) => !v)}>
        <span className="co-card__title">{title}</span>
        <span className="co-card__chev" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {!open && summary && <div className="co-card__summary">{summary}</div>}
      {open && <div className="co-card__body">{children}</div>}
    </div>
  );
}

export default function ContextPanel({ interview, candidate, jd, priorReviews }) {
  const c = candidate || {};
  const i = interview || {};
  const sc = c.screening || {};
  return (
    <aside className="co-context">
      <Card
        title="Job description"
        summary={i.role || (jd && jd.title) || 'Role'}
        defaultOpen
      >
        <div className="co-context__jd">{(jd && (jd.text || jd.description)) || 'No JD attached.'}</div>
      </Card>

      <Card
        title="Candidate"
        summary={`${c.name || '—'} · ${c.experience ?? '—'}y`}
        defaultOpen
      >
        <div className="co-context__row"><span>Email</span><strong>{c.email || '—'}</strong></div>
        <div className="co-context__row"><span>Experience</span><strong>{c.experience ?? '—'} yrs</strong></div>
        <div className="co-context__row"><span>Stack</span><strong>{(c.techStack || []).join(', ') || '—'}</strong></div>
        {c.resumeUrl && (
          <div className="co-context__row">
            <span>Resume</span><a href={c.resumeUrl} target="_blank" rel="noopener noreferrer">Download</a>
          </div>
        )}
      </Card>

      {sc.status && (
        <Card
          title={`Screening · ${sc.matchPercent ?? '—'}%`}
          summary={`Greens ${(sc.greenFlags || []).length} · Reds ${(sc.redFlags || []).length}`}
        >
          {sc.summary && <p className="co-context__sum">{sc.summary}</p>}
          {(sc.greenFlags || []).length > 0 && (
            <div className="co-context__flags">
              <h5>Green</h5>
              <ul>{sc.greenFlags.map((f, i2) => <li key={`g${i2}`}>{f}</li>)}</ul>
            </div>
          )}
          {(sc.redFlags || []).length > 0 && (
            <div className="co-context__flags">
              <h5>Red</h5>
              <ul>{sc.redFlags.map((f, i2) => <li key={`r${i2}`}>{f}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      {(priorReviews || []).map((r, i2) => (
        <Card
          key={`pr${i2}`}
          title={`Prior round ${i2 + 1}`}
          summary={`Knowledge ${r.ratings?.knowledge ?? '—'}/5`}
        >
          <div className="co-context__row"><span>Knowledge</span><strong>{r.ratings?.knowledge ?? '—'}/5</strong></div>
          <div className="co-context__row"><span>Communication</span><strong>{r.ratings?.communication ?? '—'}/5</strong></div>
          <div className="co-context__row"><span>Confidence</span><strong>{r.ratings?.confidence ?? '—'}/5</strong></div>
          {r.comments && <p className="co-context__sum">{r.comments}</p>}
        </Card>
      ))}
    </aside>
  );
}

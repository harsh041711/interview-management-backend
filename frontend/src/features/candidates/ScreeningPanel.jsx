import Button from '@/components/common/Button';
import './ScreeningPanel.scss';

export default function ScreeningPanel({ screening, candidate, onRescreen, rescreening }) {
  if (!screening?.status) return null;

  const recommend = screening.status === 'scored'
    ? (screening.matchPercent >= 60 ? 'approve' : 'decline')
    : null;

  return (
    <div className="screening-panel">
      <div className="screening-panel__head">
        <div className="screening-panel__title">
          Screening
          {screening.jdSnapshot?.title && (
            <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
              · JD: {screening.jdSnapshot.title}
            </span>
          )}
        </div>
        {(['resume_pending', 'resume_approved'].includes(candidate.status)) && (
          <Button size="sm" variant="secondary" onClick={onRescreen} loading={rescreening}>
            Re-screen against current JD
          </Button>
        )}
      </div>

      {screening.status === 'skipped' && (
        <div className="screening-panel__warning">
          ⚠ No JD configured for {(candidate.techStack || []).join(', ')} / {candidate.experience}.
          Create one in Job Descriptions, then click Re-screen.
        </div>
      )}

      {screening.status === 'failed' && (
        <div className="screening-panel__warning">
          ⚠ AI screening unavailable — review manually.
        </div>
      )}

      {screening.status === 'scored' && (
        <>
          <div>
            <span className={`screening-panel__match ${screening.matchPercent >= 60 ? 'screening-panel__match--high' : 'screening-panel__match--low'}`}>
              Match: {screening.matchPercent}%
            </span>
            <span className={`screening-panel__rec screening-panel__rec--${recommend}`}>
              AI recommends: {recommend === 'approve' ? 'Approve' : 'Decline'}
            </span>
          </div>

          <div className="screening-panel__flags">
            <div className="screening-panel__flagGroup screening-panel__flagGroup--green">
              <h4>✓ Green flags</h4>
              <ul>{(screening.greenFlags || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
            <div className="screening-panel__flagGroup screening-panel__flagGroup--red">
              <h4>✗ Red flags</h4>
              <ul>{(screening.redFlags || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          </div>

          {screening.summary && (
            <div className="screening-panel__summary">{screening.summary}</div>
          )}

          <div className="screening-panel__meta">
            Scored by {screening.scoredBy} · {screening.scoredAt && new Date(screening.scoredAt).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}

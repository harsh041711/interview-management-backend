import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import StarRating from '@/components/common/StarRating';
import { formatDate } from '@/utils/formatters';
import { fetchReviewByCandidate } from './reviewSlice';
import './ReviewPanel.scss';

export default function ReviewPanel({ candidateId }) {
  const dispatch = useDispatch();
  const data = useSelector((s) => s.reviews.byCandidate[candidateId]);

  useEffect(() => {
    if (candidateId) dispatch(fetchReviewByCandidate(candidateId));
  }, [candidateId, dispatch]);

  if (!data) return null;
  if (!data.review) return <div className="review-panel review-panel--empty">No review submitted yet.</div>;

  const r = data.review;
  return (
    <div className="review-panel">
      <div className="review-panel__head">
        <strong>{r.interviewer?.name || 'Interviewer'}</strong>
        <span className="review-panel__avg">avg {r.averageRating ?? '—'}/5</span>
      </div>
      <div className="review-panel__ratings">
        <StarRating size="sm" label="Knowledge" value={r.ratings.knowledge} readOnly />
        <StarRating size="sm" label="Communication" value={r.ratings.communication} readOnly />
        <StarRating size="sm" label="Confidence" value={r.ratings.confidence} readOnly />
      </div>
      <div className="review-panel__comments">{r.comments}</div>
      <div className="review-panel__meta">
        Submitted {formatDate(r.submittedAt)}
        {r.lastEditedAt && ` · last edited ${formatDate(r.lastEditedAt)}`}
        {r.editCount > 0 && ` · ${r.editCount} edit${r.editCount === 1 ? '' : 's'}`}
      </div>
      {data.history && data.history.length > 0 && (
        <details className="review-panel__history">
          <summary>Edit-request history ({data.history.length})</summary>
          <ul>
            {data.history.map((h) => (
              <li key={h._id || h.id}>
                <span className={`review-panel__pill review-panel__pill--${h.status}`}>{h.status}</span>
                {' '}{formatDate(h.createdAt)}
                {h.reason && <div className="review-panel__history-reason">{h.reason}</div>}
                {h.decisionNote && <div className="review-panel__history-note">HR: {h.decisionNote}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

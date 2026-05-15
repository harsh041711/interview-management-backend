import { useMemo, useState } from 'react';
import Button from '@/components/common/Button';
import { formatDate } from '@/utils/formatters';
import './CandidateTimeline.scss';

const ROUND_TYPE_LABEL = {
  technical: 'Technical',
  practical: 'Practical',
  hr_culture: 'HR-Culture',
};

const STATUS_META = {
  completed:             { icon: '✓', label: 'Completed',         tone: 'ok' },
  scheduled:             { icon: '📅', label: 'Scheduled',         tone: 'sched' },
  reschedule_requested:  { icon: '↻', label: 'Reschedule pending', tone: 'warn' },
  cancelled:             { icon: '✕', label: 'Cancelled',          tone: 'cancel' },
};

const NEXT_ROUND_TYPE = ['technical', 'practical', 'hr_culture'];

const eligibleForNextRound = (interviews, reviews, candidateStatus) => {
  if (!interviews?.length) return null;
  const last = interviews[interviews.length - 1];
  if (last.status !== 'completed') return null;
  const hasReview = reviews.some((r) => String(r.interview) === String(last._id || last.id));
  if (!hasReview) return { reason: 'needs-review' };
  if ((last.round || 0) >= 3) return null;
  const ok = ['awaiting_decision', 'selected_for_culture', 'shortlisted'].includes(candidateStatus);
  if (!ok) return null;
  const nextRoundType = NEXT_ROUND_TYPE[last.round] || 'practical';
  return { nextRoundType };
};

export default function CandidateTimeline({ candidate, interviews = [], reviews = [], onScheduleNext, onShowNotes }) {
  const [expandedId, setExpandedId] = useState(null);
  const reviewByInterview = useMemo(() => {
    const map = new Map();
    for (const r of reviews) map.set(String(r.interview), r);
    return map;
  }, [reviews]);

  const next = eligibleForNextRound(interviews, reviews, candidate?.status);

  if (interviews.length === 0) {
    return (
      <div className="ctl ctl--empty">
        <h3 className="ctl__heading">Interview history</h3>
        <p className="ctl__empty-msg">No interviews scheduled yet.</p>
        {['shortlisted', 'awaiting_decision', 'selected_for_culture'].includes(candidate?.status) && (
          <Button size="sm" onClick={() => onScheduleNext?.({ roundType: 'technical' })}>
            + Schedule interview
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="ctl">
      <h3 className="ctl__heading">Interview history</h3>

      <ol className="ctl__stepper">
        {interviews.map((iv) => {
          const meta = STATUS_META[iv.status] || STATUS_META.scheduled;
          const review = reviewByInterview.get(String(iv._id || iv.id));
          const isExpanded = expandedId === (iv._id || iv.id);
          const isCancelled = iv.status === 'cancelled';
          return (
            <li key={iv._id || iv.id} className={`ctl__node ctl__node--${meta.tone}`}>
              <button
                type="button"
                className="ctl__dot"
                onClick={() => setExpandedId(isExpanded ? null : (iv._id || iv.id))}
                aria-expanded={isExpanded}
                disabled={isCancelled && !review}
              >
                <span className="ctl__dot-icon">{meta.icon}</span>
              </button>
              <div className="ctl__caption">
                <div className="ctl__caption-line">R{iv.round} · {ROUND_TYPE_LABEL[iv.roundType] || iv.roundType}</div>
                <div className="ctl__caption-line">{meta.label} · {iv.scheduledAt ? formatDate(iv.scheduledAt) : ''}</div>
                {iv.interviewer?.name && <div className="ctl__caption-line ctl__caption-line--sub">{iv.interviewer.name}</div>}
              </div>
            </li>
          );
        })}

        {next && (
          <li className="ctl__node ctl__node--next">
            <button
              type="button"
              className="ctl__dot ctl__dot--next"
              onClick={() => next.nextRoundType && onScheduleNext?.({ roundType: next.nextRoundType })}
              disabled={!next.nextRoundType}
              title={next.reason === 'needs-review' ? "Submit the previous round's review before scheduling the next." : ''}
            >
              <span className="ctl__dot-icon">+</span>
            </button>
            <div className="ctl__caption">
              <div className="ctl__caption-line">Schedule next round</div>
              {next.nextRoundType && (
                <div className="ctl__caption-line ctl__caption-line--sub">{ROUND_TYPE_LABEL[next.nextRoundType]}</div>
              )}
              {next.reason === 'needs-review' && (
                <div className="ctl__caption-line ctl__caption-line--sub">Awaiting review</div>
              )}
            </div>
          </li>
        )}
      </ol>

      {expandedId && (() => {
        const iv = interviews.find((x) => (x._id || x.id) === expandedId);
        if (!iv) return null;
        const review = reviewByInterview.get(String(iv._id || iv.id));
        return (
          <div className="ctl__expand">
            <div className="ctl__expand-head">
              R{iv.round} · {ROUND_TYPE_LABEL[iv.roundType] || iv.roundType}
              {iv.interviewer?.name ? ` · ${iv.interviewer.name}` : ''}
              {iv.scheduledAt ? ` · ${formatDate(iv.scheduledAt)}` : ''}
            </div>
            {iv.status === 'cancelled' && (
              <div className="ctl__expand-body ctl__expand-body--muted">
                Cancelled — {iv.notes || 'no reason provided'}
              </div>
            )}
            {iv.status !== 'cancelled' && !review && (
              <div className="ctl__expand-body ctl__expand-body--muted">
                (No review yet — the interviewer hasn't submitted.)
              </div>
            )}
            {review && (
              <div className="ctl__expand-body">
                <div className="ctl__ratings">
                  <span>Knowledge <strong>{review.ratings?.knowledge ?? '—'}/5</strong></span>
                  <span>Communication <strong>{review.ratings?.communication ?? '—'}/5</strong></span>
                  <span>Confidence <strong>{review.ratings?.confidence ?? '—'}/5</strong></span>
                </div>
                {review.comments && <p className="ctl__comments">{review.comments}</p>}
                {iv.status === 'completed' && (iv.copilotQuestions?.length > 0) && (
                  <button
                    type="button"
                    className="ctl__notes-link"
                    onClick={() => onShowNotes?.(iv.copilotQuestions)}
                  >
                    View co-pilot notes →
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

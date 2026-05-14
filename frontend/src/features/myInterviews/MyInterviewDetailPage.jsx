import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, Link } from 'react-router-dom';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import StatusBadge from '@/components/common/StatusBadge';
import StarRating from '@/components/common/StarRating';
import Modal from '@/components/common/Modal';
import { useToast } from '@/components/common/Toast';
import { formatDate } from '@/utils/formatters';
import {
  fetchMyInterview, submitMyReview, editMyReview, requestMyReviewEdit, clearDetail,
} from './myInterviewsSlice';
import ReviewForm from './ReviewForm';
import './MyInterviewDetailPage.scss';

const COPILOT_WINDOW_MIN = 15;

function canOpenCopilot(interview) {
  if (!interview) return false;
  if (interview.status === 'cancelled' || interview.status === 'completed') return false;
  if (interview.status === 'reschedule_requested') return false;
  const scheduledAt = interview.scheduledAt ? new Date(interview.scheduledAt).getTime() : 0;
  const now = Date.now();
  return scheduledAt > 0 && (scheduledAt - now) <= COPILOT_WINDOW_MIN * 60 * 1000;
}

export default function MyInterviewDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { push } = useToast();
  const { detail, detailStatus, busy } = useSelector((s) => s.myInterviews);
  const [editing, setEditing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    dispatch(fetchMyInterview(id));
    return () => { dispatch(clearDetail()); };
  }, [id, dispatch]);

  if (detailStatus === 'loading' && !detail) return <Loader message="Loading interview…" />;
  if (detailStatus === 'failed' || !detail) {
    return <EmptyState title="Couldn't load this interview" description="Please go back and try again." />;
  }

  const { interview, review, pendingEditRequest, canEdit } = detail;
  const candidate = interview.candidate || {};
  const isCompleted = interview.status === 'completed';
  const canSubmitReview = !review && (interview.status === 'scheduled' || interview.status === 'completed');

  const onSubmit = async (payload) => {
    const action = await dispatch(submitMyReview({ id, ...payload }));
    if (submitMyReview.fulfilled.match(action)) {
      push({ type: 'success', message: 'Review submitted' });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not submit review' });
    }
  };

  const onEdit = async (payload) => {
    const action = await dispatch(editMyReview({ reviewId: review._id || review.id, ...payload }));
    if (editMyReview.fulfilled.match(action)) {
      setEditing(false);
      push({ type: 'success', message: 'Review updated' });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not update review' });
    }
  };

  const onRequestEdit = async () => {
    const action = await dispatch(requestMyReviewEdit({ reviewId: review._id || review.id, reason }));
    if (requestMyReviewEdit.fulfilled.match(action)) {
      setRequestOpen(false);
      setReason('');
      push({ type: 'success', message: 'Edit request sent to HR' });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not send request' });
    }
  };

  return (
    <div className="my-interview">
      <Link to="/interviewer/dashboard" className="my-interview__back">← Back to dashboard</Link>

      <header className="my-interview__head">
        <h1>{candidate.name || 'Candidate'}</h1>
        <StatusBadge status={interview.status} />
      </header>

      <section className="my-interview__details">
        <div><span>Date &amp; time</span><strong>{formatDate(interview.scheduledAt)}</strong></div>
        <div><span>Duration</span><strong>{interview.durationMinutes} min</strong></div>
        {candidate.email && <div><span>Candidate</span><strong>{candidate.email}</strong></div>}
        {candidate.resumeUrl && (
          <div><span>Resume</span><a href={candidate.resumeUrl} target="_blank" rel="noopener noreferrer">Download</a></div>
        )}
        {interview.notes && (
          <div className="my-interview__notes"><span>HR notes</span><div>{interview.notes}</div></div>
        )}
      </section>

      <div className="my-interview__actions-row">
        {interview.meetingUrl && (interview.status === 'scheduled' || interview.status === 'reschedule_requested') && (
          <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="my-interview__join">Join meeting</a>
        )}
        {canOpenCopilot(interview) && (
          <Link to={`/interviewer/interviews/${id}/live`} className="my-interview__join my-interview__join--secondary">
            Open co-pilot
          </Link>
        )}
      </div>

      <section className="my-interview__review-block">
        <h2>Review</h2>
        {!canSubmitReview && !review && (
          <p className="my-interview__hint">
            {interview.status === 'cancelled'
              ? 'This interview was cancelled — no review needed.'
              : interview.status === 'reschedule_requested'
              ? 'A reschedule is pending HR review. The form will unlock once it is resolved.'
              : 'The review form unlocks once the interview is scheduled.'}
          </p>
        )}

        {canSubmitReview && (
          <>
            {!isCompleted && (
              <p className="my-interview__hint">
                Submitting your review will mark this interview as completed.
              </p>
            )}
            <ReviewForm
              onSubmit={onSubmit}
              busy={busy}
              submitLabel={isCompleted ? 'Submit review' : 'Submit review & mark complete'}
            />
          </>
        )}

        {review && !editing && (
          <div className="my-interview__review">
            <div className="my-interview__rating-grid">
              <StarRating label="Knowledge" value={review.ratings.knowledge} readOnly />
              <StarRating label="Communication" value={review.ratings.communication} readOnly />
              <StarRating label="Confidence" value={review.ratings.confidence} readOnly />
            </div>
            <div className="my-interview__comments">{review.comments}</div>
            <div className="my-interview__review-meta">
              Submitted {formatDate(review.submittedAt)}
              {review.lastEditedAt && ` · last edited ${formatDate(review.lastEditedAt)}`}
              {review.editCount > 0 && ` · ${review.editCount} edit${review.editCount === 1 ? '' : 's'}`}
            </div>
            <div className="my-interview__actions">
              {pendingEditRequest && (
                <div className="my-interview__banner my-interview__banner--warn">
                  Edit request pending HR review.
                </div>
              )}
              {!pendingEditRequest && canEdit && (
                <Button onClick={() => setEditing(true)}>Edit review</Button>
              )}
              {!pendingEditRequest && !canEdit && (
                <Button variant="secondary" onClick={() => setRequestOpen(true)}>Request edit</Button>
              )}
            </div>
          </div>
        )}

        {review && editing && (
          <ReviewForm
            initial={review}
            onSubmit={onEdit}
            busy={busy}
            submitLabel="Save changes"
          />
        )}
      </section>

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request edit permission"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button onClick={onRequestEdit} loading={busy}>Send request</Button>
          </>
        }
      >
        <p>HR will review your request. Once approved, you'll be able to edit the review.</p>
        <textarea
          rows={4}
          maxLength={1000}
          placeholder="Reason (optional)…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import StatusBadge from '@/components/common/StatusBadge';
import Modal from '@/components/common/Modal';
import { useToast } from '@/components/common/Toast';
import { copyToClipboard, formatDate, relativeFromNow } from '@/utils/formatters';
import { candidateApi } from '@/api/candidateApi';
import {
  fetchCandidate,
  deleteCandidate,
  regenerateCandidateToken,
  resendCandidateInvite,
  selectCandidate,
  rejectCandidate,
} from './candidateSlice';
import ScreeningPanel from './ScreeningPanel';
import SendCodingTestModal from './SendCodingTestModal';
import ReviewPanel from '@/features/reviews/ReviewPanel';
import './CandidateDetailPage.scss';

export default function CandidateDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const { current, currentStatus, error } = useSelector((s) => s.candidates);
  const [actBusy, setActBusy] = useState(null); // 'approve' | 'decline' | 'rescreen' | 'sendTest' | 'resend' | 'regenerate' | 'select' | 'reject' | 'delete'
  const [confirmOverride, setConfirmOverride] = useState(null); // 'approve' | 'decline' | null
  const [codingTestOpen, setCodingTestOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchCandidate(id));
  }, [dispatch, id]);

  if (currentStatus === 'loading' && !current) return <Loader message="Loading candidate…" />;
  if (currentStatus === 'failed' || !current) {
    return (
      <div className="candidate-detail">
        <Link to="/candidates" className="candidate-detail__back">← Back to candidates</Link>
        <EmptyState title="Couldn't load this candidate" description={error || 'Please go back and try again.'} />
      </div>
    );
  }

  const c = current;

  const refresh = () => dispatch(fetchCandidate(id));

  const onCopy = async () => {
    const ok = await copyToClipboard(c.testUrl);
    push({ type: ok ? 'success' : 'error', message: ok ? 'Test link copied' : 'Failed to copy link' });
  };

  const wrap = (action, fn, successMsg) => async () => {
    setActBusy(action);
    try {
      await fn();
      if (successMsg) push({ type: 'success', message: successMsg });
      refresh();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || err.payload?.message || `${action} failed` });
    } finally {
      setActBusy(null);
    }
  };

  const onApprove = async ({ skipConfirm } = {}) => {
    const scored = c.screening?.status === 'scored';
    if (!skipConfirm && scored && c.screening.matchPercent < 60) {
      setConfirmOverride('approve');
      return;
    }
    setConfirmOverride(null);
    await wrap('approve', () => candidateApi.approveResume(c.id), 'Approved — shortlist email queued')();
  };

  const onDeclineResume = async ({ skipConfirm } = {}) => {
    const scored = c.screening?.status === 'scored';
    if (!skipConfirm && scored && c.screening.matchPercent >= 60) {
      setConfirmOverride('decline');
      return;
    }
    setConfirmOverride(null);
    await wrap('decline', () => candidateApi.declineResume(c.id), 'Declined — rejection email queued')();
  };

  const onRescreen = wrap('rescreen', () => candidateApi.rescreen(c.id), 'Re-screened');
  const onSendTest = wrap('sendTest', () => candidateApi.sendTest(c.id), 'Test invitation sent');

  const onResend = async () => {
    setActBusy('resend');
    const action = await dispatch(resendCandidateInvite(c.id));
    if (resendCandidateInvite.fulfilled.match(action)) {
      push({ type: 'success', message: `Invite re-sent to ${action.payload.sentTo}` });
      refresh();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not send invite' });
    }
    setActBusy(null);
  };

  const onRegenerate = async () => {
    setActBusy('regenerate');
    const action = await dispatch(regenerateCandidateToken(c.id));
    if (regenerateCandidateToken.fulfilled.match(action)) {
      push({ type: 'success', message: 'New token generated and invite re-sent' });
      refresh();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not regenerate' });
    }
    setActBusy(null);
  };

  const onSelect = async () => {
    if (!window.confirm('Mark this candidate as selected for the culture-fit round? An email will be sent.')) return;
    setActBusy('select');
    const action = await dispatch(selectCandidate(c.id));
    if (selectCandidate.fulfilled.match(action)) {
      push({ type: 'success', message: 'Candidate selected' });
      refresh();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not save' });
    }
    setActBusy(null);
  };

  const onReject = async () => {
    const note = window.prompt('Optional note (visible to candidate). Leave empty to skip.', '');
    if (note === null) return;
    if (!window.confirm('Send final rejection? This cannot be undone.')) return;
    setActBusy('reject');
    const action = await dispatch(rejectCandidate({ id: c.id, note: note || undefined }));
    if (rejectCandidate.fulfilled.match(action)) {
      push({ type: 'success', message: 'Candidate rejected' });
      refresh();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not save' });
    }
    setActBusy(null);
  };

  const onDelete = async () => {
    if (!window.confirm('Delete this candidate? This cannot be undone.')) return;
    setActBusy('delete');
    const action = await dispatch(deleteCandidate(c.id));
    if (deleteCandidate.fulfilled.match(action)) {
      push({ type: 'success', message: 'Candidate deleted' });
      navigate('/candidates', { replace: true });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not delete' });
      setActBusy(null);
    }
  };

  const tokenExpired = c.tokenExpiresAt && new Date(c.tokenExpiresAt) < new Date();

  return (
    <div className="candidate-detail">
      <Link to="/candidates" className="candidate-detail__back">← Back to candidates</Link>

      <div className="candidate-detail__head">
        <div className="candidate-detail__identity">
          <div className="candidate-detail__avatar">
            {c.photoUrl ? <img src={c.photoUrl} alt="" /> : (c.name?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <h1>{c.name}</h1>
            <div className="candidate-detail__identity-email">{c.email}</div>
            <div className="candidate-detail__identity-meta">Created {formatDate(c.createdAt)}</div>
          </div>
        </div>
        <div className="candidate-detail__status">
          <StatusBadge status={c.status} />
        </div>
      </div>

      <div className="candidate-detail__chips">
        {(c.techStack || []).map((t) => <span key={t} className="chip">{t}</span>)}
        {c.experience && <span className="chip chip--exp">{c.experience}</span>}
        {c.resumeUrl
          ? <a href={c.resumeUrl} target="_blank" rel="noopener noreferrer">📄 Download resume</a>
          : <span style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: 13 }}>No resume</span>}
      </div>

      <div className="candidate-detail__actions">
        {c.status === 'resume_pending' && (
          <>
            <Button onClick={() => onApprove()} loading={actBusy === 'approve'}>Approve</Button>
            <Button variant="secondary" onClick={() => onDeclineResume()} loading={actBusy === 'decline'}>Decline</Button>
          </>
        )}
        {c.status === 'resume_approved' && (
          <Button onClick={onSendTest} loading={actBusy === 'sendTest'}>Send test</Button>
        )}
        {!['resume_pending', 'resume_approved', 'resume_declined', 'completed', 'cheated'].includes(c.status) && (
          <Button variant="secondary" onClick={onResend} loading={actBusy === 'resend'}>Resend invite</Button>
        )}
        {!['resume_pending', 'resume_approved', 'resume_declined', 'in_progress', 'completed', 'cheated'].includes(c.status) && (
          <Button variant="ghost" onClick={onRegenerate} loading={actBusy === 'regenerate'}>Regenerate token</Button>
        )}
        {c.testUrl && !['resume_pending', 'resume_approved', 'resume_declined'].includes(c.status) && (
          <Button variant="secondary" onClick={onCopy}>Copy test link</Button>
        )}
        {c.status === 'awaiting_decision' && (
          <>
            <Button onClick={onSelect} loading={actBusy === 'select'}>Select for culture</Button>
            <Button variant="ghost" onClick={onReject} loading={actBusy === 'reject'}>Reject</Button>
          </>
        )}
        {['resume_approved', 'pending', 'in_progress', 'completed', 'awaiting_decision', 'shortlisted', 'selected_for_culture'].includes(c.status) && (
          <Button variant="secondary" onClick={() => setCodingTestOpen(true)}>
            {c.codingTest?.sentAt ? 'Re-send coding test' : 'Send coding test'}
          </Button>
        )}
        <Button variant="ghost" onClick={onDelete} loading={actBusy === 'delete'}>Delete</Button>
      </div>

      <ScreeningPanel
        screening={c.screening}
        candidate={c}
        onRescreen={onRescreen}
        rescreening={actBusy === 'rescreen'}
      />

      {c.codingTest?.sentAt && (
        <div className="candidate-detail__coding-summary">
          <div className="candidate-detail__coding-summary-head">
            <div>
              <div className="candidate-detail__coding-summary-title">Coding Test</div>
              <div className="candidate-detail__coding-summary-meta">
                Sent {formatDate(c.codingTest.sentAt)}
                {c.codingTest.submittedAt
                  ? ` · Submitted ${formatDate(c.codingTest.submittedAt)}`
                  : ' · Awaiting candidate'}
                {' · '}{c.codingTest.problemCount} problem(s) · {c.codingTest.durationMinutes} min
              </div>
            </div>
            <span className={`candidate-detail__coding-summary-pill candidate-detail__coding-summary-pill--${c.codingTest.outcome || 'awaiting'}`}>
              {c.codingTest.outcome === 'shortlisted' && 'Shortlisted'}
              {c.codingTest.outcome === 'rejected' && 'Rejected'}
              {c.codingTest.outcome === 'pending_review' && 'Pending review'}
              {!c.codingTest.outcome && (c.codingTest.submittedAt ? 'Submitted' : 'Awaiting candidate')}
            </span>
          </div>
          <Link to={`/candidates/${c.id}/coding-test`} className="candidate-detail__coding-summary-btn">
            View coding test submission →
          </Link>
        </div>
      )}

      {['awaiting_decision', 'selected_for_culture', 'final_rejected'].includes(c.status) && (
        <ReviewPanel candidateId={c.id} />
      )}

      {c.testUrl && !['resume_pending', 'resume_approved', 'resume_declined'].includes(c.status) && (
        <div className="candidate-detail__token">
          <div>Test link</div>
          <code>{c.testUrl}</code>
          <div className={`candidate-detail__token-expiry ${tokenExpired ? 'candidate-detail__token--expired' : ''}`}>
            {c.tokenExpiresAt
              ? (tokenExpired ? `Expired ${relativeFromNow(c.tokenExpiresAt)}` : `Expires ${relativeFromNow(c.tokenExpiresAt)}`)
              : '—'}
          </div>
        </div>
      )}

      <SendCodingTestModal
        open={codingTestOpen}
        candidateId={c.id}
        onClose={() => setCodingTestOpen(false)}
        onSent={refresh}
      />

      <Modal
        open={confirmOverride !== null}
        onClose={() => setConfirmOverride(null)}
        title="Override AI recommendation?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOverride(null)}>Cancel</Button>
            <Button onClick={() => (confirmOverride === 'approve'
              ? onApprove({ skipConfirm: true })
              : onDeclineResume({ skipConfirm: true }))}>
              Confirm {confirmOverride === 'approve' ? 'Approve' : 'Decline'}
            </Button>
          </>
        }
      >
        {confirmOverride === 'approve' && (
          <p>AI recommends declining this candidate (match: {c.screening?.matchPercent}%). Approve anyway?</p>
        )}
        {confirmOverride === 'decline' && (
          <p>AI recommends approving this candidate (match: {c.screening?.matchPercent}%). Decline anyway?</p>
        )}
      </Modal>
    </div>
  );
}

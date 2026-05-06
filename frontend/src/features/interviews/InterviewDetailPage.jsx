import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import StatusBadge from '@/components/common/StatusBadge';
import Button from '@/components/common/Button';
import CopyButton from '@/components/common/CopyButton';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { formatScheduledAt } from '@/utils/datetime';
import { formatDate } from '@/utils/formatters';
import {
  fetchInterview,
  cancelInterview,
  completeInterview,
  decideReschedule,
} from './interviewSlice';
import ScheduleInterviewModal from './ScheduleInterviewModal';
import './InterviewDetailPage.scss';

const FRONTEND_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FRONTEND_URL) ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export default function InterviewDetailPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { id } = useParams();

  const { selected, selectedStatus, pendingReschedule, rescheduleHistory, error } =
    useSelector((s) => s.interviews);

  const [editOpen, setEditOpen] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [decidingBusy, setDecidingBusy] = useState(false);

  useEffect(() => {
    dispatch(fetchInterview(id));
  }, [dispatch, id]);

  const refetch = () => dispatch(fetchInterview(id));

  const onCancel = async () => {
    const reason = window.prompt('Cancel reason (optional):');
    if (reason === null) return; // user pressed Cancel in prompt
    const action = await dispatch(cancelInterview({ id, body: { reason: reason.trim() || undefined } }));
    if (cancelInterview.fulfilled.match(action)) {
      push({ type: 'success', message: 'Interview cancelled' });
      refetch();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed to cancel' });
    }
  };

  const onComplete = async () => {
    const note = window.prompt('Completion note (optional):');
    if (note === null) return;
    const action = await dispatch(completeInterview({ id, body: { note: note.trim() || undefined } }));
    if (completeInterview.fulfilled.match(action)) {
      push({ type: 'success', message: 'Interview marked as completed' });
      refetch();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed to complete' });
    }
  };

  const onDecide = async (decision) => {
    setDecidingBusy(true);
    const action = await dispatch(
      decideReschedule({ id, body: { decision, decisionNote: decisionNote.trim() || undefined } }),
    );
    setDecidingBusy(false);
    if (decideReschedule.fulfilled.match(action)) {
      push({ type: 'success', message: `Reschedule ${decision === 'approve' ? 'approved' : 'rejected'}` });
      setDecisionNote('');
      refetch();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed to decide' });
    }
  };

  if (selectedStatus === 'loading' || (!selected && selectedStatus !== 'failed')) {
    return <Loader message="Loading interview…" />;
  }
  if (selectedStatus === 'failed' || error) {
    return <EmptyState title="Failed to load" description={error || 'Unknown error'} />;
  }
  if (!selected) return null;

  const candidate = selected.candidate || {};
  const interviewer = selected.interviewer || {};
  const isTerminal = selected.status === 'completed' || selected.status === 'cancelled';
  const isScheduled = selected.status === 'scheduled';
  const candidateLink = `${FRONTEND_URL}/interview/${selected.candidateAccessToken}`;
  const interviewerLink = `${FRONTEND_URL}/interview/${selected.interviewerAccessToken}`;

  return (
    <div className="interview-detail">
      <Link to="/interviews" className="interview-detail__back">← Back to interviews</Link>

      {/* Top card */}
      <div className="interview-detail__card">
        <div className="interview-detail__schedule">
          <div className="interview-detail__time">{formatScheduledAt(selected.scheduledAt)}</div>
          <div className="interview-detail__duration">{selected.durationMinutes} min</div>
          <StatusBadge status={selected.status} />
        </div>

        <div className="interview-detail__row">
          <span className="interview-detail__row-label">Candidate</span>
          <div>
            <div className="interview-detail__name">{candidate.name || '—'}</div>
            <div className="interview-detail__email">{candidate.email || ''}</div>
          </div>
        </div>

        <div className="interview-detail__row">
          <span className="interview-detail__row-label">Interviewer</span>
          <div>
            <div className="interview-detail__name">{interviewer.name || '—'}</div>
            <div className="interview-detail__chips">
              {(interviewer.expertise || []).map((e) => (
                <span key={e} className="chip">{e}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="interview-detail__row">
          <span className="interview-detail__row-label">Meeting URL</span>
          <div className="interview-detail__meeting">
            <a href={selected.meetingUrl} target="_blank" rel="noopener noreferrer" className="interview-detail__link">
              {selected.meetingUrl}
            </a>
            <CopyButton text={selected.meetingUrl} label="Copy URL" />
          </div>
        </div>

        <div className="interview-detail__row">
          <span className="interview-detail__row-label">Links</span>
          <div className="interview-detail__copy-row">
            <CopyButton text={candidateLink} label="Copy candidate link" />
            <CopyButton text={interviewerLink} label="Copy interviewer link" />
          </div>
        </div>

        {selected.notes && (
          <div className="interview-detail__row">
            <span className="interview-detail__row-label">Notes</span>
            <div className="interview-detail__notes">{selected.notes}</div>
          </div>
        )}

        {selected.status === 'completed' && (
          <div className="interview-detail__outcome">
            <strong>Completed:</strong> {formatDate(selected.completedAt)}
            {selected.completionNote && <> — {selected.completionNote}</>}
          </div>
        )}

        {selected.status === 'cancelled' && (
          <div className="interview-detail__cancelled">
            <strong>Cancelled:</strong> {formatDate(selected.cancelledAt)}
            {selected.cancelReason && <> — {selected.cancelReason}</>}
          </div>
        )}

        {/* Action buttons */}
        {!isTerminal && isScheduled && !pendingReschedule && (
          <div className="interview-detail__actions">
            <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button size="sm" variant="secondary" onClick={onComplete}>Mark complete</Button>
            <Button size="sm" variant="danger" onClick={onCancel}>Cancel interview</Button>
          </div>
        )}
        {selected.status === 'reschedule_requested' && !isTerminal && (
          <div className="interview-detail__actions">
            <Button size="sm" variant="danger" onClick={onCancel}>Cancel interview</Button>
          </div>
        )}
      </div>

      {/* Pending reschedule banner */}
      {pendingReschedule && (
        <div className="interview-detail__reschedule-banner">
          <h3>Pending reschedule request</h3>
          <div className="interview-detail__reschedule-info">
            <div><strong>Current time:</strong> {formatScheduledAt(selected.scheduledAt)}</div>
            <div><strong>Proposed time:</strong> {formatScheduledAt(pendingReschedule.proposedAt)}</div>
            {pendingReschedule.proposedDurationMinutes && (
              <div><strong>Proposed duration:</strong> {pendingReschedule.proposedDurationMinutes} min</div>
            )}
            {pendingReschedule.reason && (
              <div><strong>Reason:</strong> {pendingReschedule.reason}</div>
            )}
          </div>
          <Input
            label="Decision note (optional)"
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="Note for the interviewer…"
          />
          <div className="interview-detail__reschedule-actions">
            <Button
              variant="success"
              size="sm"
              loading={decidingBusy}
              onClick={() => onDecide('approve')}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={decidingBusy}
              onClick={() => onDecide('reject')}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Reschedule history */}
      {rescheduleHistory.length > 0 && (
        <div className="interview-detail__history">
          <button
            type="button"
            className="interview-detail__history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? '▾' : '▸'} Reschedule history ({rescheduleHistory.length})
          </button>
          {historyOpen && (
            <ul className="interview-detail__history-list">
              {rescheduleHistory.map((req) => (
                <li key={req.id} className="interview-detail__history-item">
                  <div><strong>Proposed:</strong> {formatScheduledAt(req.proposedAt)}</div>
                  {req.reason && <div><strong>Reason:</strong> {req.reason}</div>}
                  <div>
                    <StatusBadge status={req.status === 'approved' ? 'shortlisted' : req.status === 'rejected' ? 'rejected' : 'pending'} />
                    {req.decidedAt && <> · {formatDate(req.decidedAt)}</>}
                  </div>
                  {req.decisionNote && <div><strong>Note:</strong> {req.decisionNote}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Edit modal */}
      <ScheduleInterviewModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          refetch();
        }}
        initial={selected}
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import Modal from '@/components/common/Modal';
import { useToast } from '@/components/common/Toast';
import { formatDate } from '@/utils/formatters';
import { fetchEditRequests, decideEditRequest } from './reviewEditRequestsSlice';
import './ReviewEditRequestsPage.scss';

export default function ReviewEditRequestsPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { items, status, error, busy } = useSelector((s) => s.reviewEditRequests);
  const [decisionModal, setDecisionModal] = useState(null); // { id, decision, candidate, interviewer }
  const [note, setNote] = useState('');

  useEffect(() => {
    dispatch(fetchEditRequests({ status: 'pending', page: 1, limit: 50 }));
  }, [dispatch]);

  const open = (id, decision, item) => {
    setDecisionModal({ id, decision, candidate: item.review?.candidate?.name, interviewer: item.review?.interviewer?.name });
    setNote('');
  };
  const close = () => { setDecisionModal(null); setNote(''); };

  const onConfirm = async () => {
    if (!decisionModal) return;
    const action = await dispatch(decideEditRequest({
      id: decisionModal.id, decision: decisionModal.decision, note: note.trim() || undefined,
    }));
    if (decideEditRequest.fulfilled.match(action)) {
      push({ type: 'success', message: `Request ${decisionModal.decision}` });
      close();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not save decision' });
    }
  };

  return (
    <div className="edit-requests">
      <header className="edit-requests__head">
        <h1>Review edit requests</h1>
        <p className="edit-requests__sub">{items.length} pending</p>
      </header>

      {status === 'loading' && items.length === 0 ? (
        <Loader message="Loading…" />
      ) : status === 'failed' ? (
        <EmptyState title="Couldn't load" description={error} />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing pending" description="You'll see edit requests here when interviewers submit them." />
      ) : (
        <div className="edit-requests__table">
          <table>
            <thead>
              <tr>
                <th>Interviewer</th>
                <th>Candidate</th>
                <th>Reason</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const review = it.review || {};
                const candidate = review.candidate || {};
                const interviewer = review.interviewer || {};
                return (
                  <tr key={it._id || it.id}>
                    <td>{interviewer.name || '—'}</td>
                    <td>{candidate.name || '—'}</td>
                    <td className="edit-requests__reason">{it.reason || <span className="muted">No reason given</span>}</td>
                    <td>{formatDate(it.createdAt)}</td>
                    <td className="edit-requests__actions">
                      <Button size="sm" onClick={() => open(it._id || it.id, 'approved', it)}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => open(it._id || it.id, 'rejected', it)}>Reject</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!decisionModal}
        onClose={close}
        title={decisionModal?.decision === 'approved' ? 'Approve edit request?' : 'Reject edit request?'}
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={onConfirm} loading={busy}>Confirm</Button>
          </>
        }
      >
        {decisionModal && (
          <>
            <p>
              {decisionModal.decision === 'approved'
                ? `Approve ${decisionModal.interviewer}'s request to edit ${decisionModal.candidate}'s review.`
                : `Reject ${decisionModal.interviewer}'s edit request for ${decisionModal.candidate}'s review.`}
            </p>
            <textarea
              rows={4}
              maxLength={2000}
              placeholder="Optional note to the interviewer…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: '100%', padding: 8, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6 }}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

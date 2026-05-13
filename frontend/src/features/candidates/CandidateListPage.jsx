import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { copyToClipboard, formatDate, relativeFromNow } from '@/utils/formatters';
import {
  deleteCandidate,
  fetchCandidates,
  regenerateCandidateToken,
  resendCandidateInvite,
  selectCandidate,
  rejectCandidate,
} from './candidateSlice';
import Modal from '@/components/common/Modal';
import { candidateApi } from '@/api/candidateApi';
import { exportRowsAsCsv } from '@/utils/exportCsv';
import CreateCandidateModal from './CreateCandidateModal';
import './CandidateListPage.scss';

const STATUSES = ['', 'resume_pending', 'resume_approved', 'resume_declined', 'pending', 'photo_captured', 'in_progress', 'completed', 'shortlisted', 'rejected', 'expired', 'cheated', 'awaiting_decision', 'selected_for_culture', 'final_rejected'];

export default function CandidateListPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const { list, status, meta, error } = useSelector((s) => s.candidates);
  const [filters, setFilters] = useState({ status: '', search: '', experience: '', page: 1 });
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actBusy, setActBusy] = useState({ id: null, action: null }); // { id, action: 'approve' | 'decline' | 'rescreen' | 'sendTest' }
  const [confirmOverride, setConfirmOverride] = useState(null); // { id, action: 'approve' | 'decline', candidate }

  useEffect(() => {
    const params = { page: filters.page, limit: meta.limit };
    if (filters.status) params.status = filters.status;
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.experience) params.experience = filters.experience;
    dispatch(fetchCandidates(params));
  }, [dispatch, filters, meta.limit]);

  const onCopy = async (url) => {
    const ok = await copyToClipboard(url);
    push({ type: ok ? 'success' : 'error', message: ok ? 'Test link copied' : 'Failed to copy link' });
  };

  const onRegenerate = async (id) => {
    const action = await dispatch(regenerateCandidateToken(id));
    if (regenerateCandidateToken.fulfilled.match(action)) {
      push({ type: 'success', message: 'New token generated and invite re-sent' });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not regenerate' });
    }
  };

  const onResend = async (id) => {
    const action = await dispatch(resendCandidateInvite(id));
    if (resendCandidateInvite.fulfilled.match(action)) {
      push({ type: 'success', message: `Invite re-sent to ${action.payload.sentTo}` });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not send invite' });
    }
  };

  const onSelect = async (id) => {
    if (!window.confirm('Mark this candidate as selected for the culture-fit round? An email will be sent.')) return;
    const action = await dispatch(selectCandidate(id));
    if (selectCandidate.fulfilled.match(action)) push({ type: 'success', message: 'Candidate selected' });
    else push({ type: 'error', message: action.payload?.message || 'Could not save' });
  };

  const onReject = async (id) => {
    const note = window.prompt('Optional note (visible to candidate). Leave empty to skip.', '');
    if (note === null) return; // cancelled
    if (!window.confirm('Send final rejection? This cannot be undone.')) return;
    const action = await dispatch(rejectCandidate({ id, note: note || undefined }));
    if (rejectCandidate.fulfilled.match(action)) push({ type: 'success', message: 'Candidate rejected' });
    else push({ type: 'error', message: action.payload?.message || 'Could not save' });
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this candidate? This cannot be undone.')) return;
    const action = await dispatch(deleteCandidate(id));
    if (deleteCandidate.fulfilled.match(action)) {
      push({ type: 'success', message: 'Candidate deleted' });
    }
  };

  const refreshList = () => {
    const params = { page: filters.page, limit: meta.limit };
    if (filters.status) params.status = filters.status;
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.experience) params.experience = filters.experience;
    dispatch(fetchCandidates(params));
  };

  const onApprove = async (c, { skipConfirm } = {}) => {
    const scored = c.screening?.status === 'scored';
    if (!skipConfirm && scored && c.screening.matchPercent < 60) {
      setConfirmOverride({ id: c.id, action: 'approve', candidate: c });
      return;
    }
    setConfirmOverride(null);
    setActBusy({ id: c.id, action: 'approve' });
    try {
      await candidateApi.approveResume(c.id);
      push({ type: 'success', message: 'Approved — shortlist email queued' });
      refreshList();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Approve failed' });
    } finally {
      setActBusy({ id: null, action: null });
    }
  };

  const onDeclineResume = async (c, { skipConfirm } = {}) => {
    const scored = c.screening?.status === 'scored';
    if (!skipConfirm && scored && c.screening.matchPercent >= 60) {
      setConfirmOverride({ id: c.id, action: 'decline', candidate: c });
      return;
    }
    setConfirmOverride(null);
    setActBusy({ id: c.id, action: 'decline' });
    try {
      await candidateApi.declineResume(c.id);
      push({ type: 'success', message: 'Declined — rejection email queued' });
      refreshList();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Decline failed' });
    } finally {
      setActBusy({ id: null, action: null });
    }
  };

  const onRescreen = async (c) => {
    setActBusy({ id: c.id, action: 'rescreen' });
    try {
      await candidateApi.rescreen(c.id);
      push({ type: 'success', message: 'Re-screened' });
      refreshList();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Re-screen failed' });
    } finally {
      setActBusy({ id: null, action: null });
    }
  };

  const onSendTest = async (c) => {
    setActBusy({ id: c.id, action: 'sendTest' });
    try {
      await candidateApi.sendTest(c.id);
      push({ type: 'success', message: 'Test invitation sent' });
      refreshList();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Send test failed' });
    } finally {
      setActBusy({ id: null, action: null });
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const base = { limit: 100 };
      if (filters.status) base.status = filters.status;
      if (filters.search.trim()) base.search = filters.search.trim();
      if (filters.experience) base.experience = filters.experience;
      // Paginate through all pages (backend caps limit at 100).
      const rows = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await candidateApi.list({ ...base, page });
        const batch = res.items || res.list || [];
        rows.push(...batch);
        totalPages = res.totalPages || res.meta?.totalPages || 1;
        page += 1;
        if (page > 200) break; // safety cap (20k rows)
      } while (page <= totalPages);
      if (rows.length === 0) {
        push({ type: 'warn', message: 'No candidates to export' });
        return;
      }
      exportRowsAsCsv('candidates', rows, [
        { key: 'name', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'techStack', header: 'Tech stack', value: (r) => (r.techStack || []).join('; ') },
        { key: 'experience', header: 'Experience' },
        { key: 'status', header: 'Status' },
        { key: 'matchPercent', header: 'Resume match %', value: (r) => r.screening?.matchPercent ?? '' },
        { key: 'screeningStatus', header: 'Screening', value: (r) => r.screening?.status ?? '' },
        { key: 'resumeUrl', header: 'Resume URL', value: (r) => r.resumeUrl || '' },
        { key: 'testUrl', header: 'Test link', value: (r) => r.testUrl || '' },
        { key: 'codingTestStatus', header: 'Coding test', value: (r) => r.codingTest?.outcome || (r.codingTest?.sentAt ? 'sent' : '') },
        { key: 'codingTestSubmittedAt', header: 'Coding submitted at', value: (r) => r.codingTest?.submittedAt || '' },
        { key: 'createdAt', header: 'Created at' },
      ]);
      push({ type: 'success', message: `Exported ${rows.length} candidate(s)` });
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Export failed' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="candidates-page">
      <header className="candidates-page__head">
        <div>
          <h1>Candidates</h1>
          <p className="candidates-page__sub">{meta.total} total · page {meta.page}/{meta.totalPages}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={onExport} loading={exporting}>↓ Export CSV</Button>
          <Button onClick={() => setCreateOpen(true)}>+ New candidate</Button>
        </div>
      </header>

      <section className="candidates-page__filters">
        <input
          className="candidates-page__search"
          type="search"
          placeholder="Search name or email…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
        >
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>{s ? s.replace('_', ' ') : 'All statuses'}</option>
          ))}
        </select>
        <select
          value={filters.experience}
          onChange={(e) => setFilters((f) => ({ ...f, experience: e.target.value, page: 1 }))}
        >
          <option value="">All experience</option>
          <option value="entry">Entry</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
        </select>
      </section>

      {status === 'loading' && list.length === 0 ? (
        <Loader message="Loading candidates…" />
      ) : error ? (
        <EmptyState title="Failed to load" description={error} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No candidates yet"
          description="Create your first candidate to generate a secure test link."
          action={<Button onClick={() => setCreateOpen(true)}>+ New candidate</Button>}
        />
      ) : (
        <div className="candidates-table">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Tech stack</th>
                <th>Status</th>
                <th>Match</th>
                <th>Token</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                    <td>
                      <div
                        className="candidates-table__primary"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/candidates/${c.id}`)}
                      >
                        {c.photoUrl ? <img src={c.photoUrl} alt="" /> : <span className="candidates-table__avatar">{c.name?.[0]}</span>}
                        <div>
                          <div className="candidates-table__name">{c.name}</div>
                          <div className="candidates-table__email">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="candidates-table__chips">
                        {(c.techStack || []).map((t) => <span key={t} className="chip">{t}</span>)}
                        {c.experience && <span className="chip chip--exp">{c.experience}</span>}
                      </div>
                      {c.resumeUrl ? (
                        <a
                          className="candidates-table__resume"
                          href={c.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={c.resumeOriginalName || 'Download resume'}
                        >
                          📄 Resume
                        </a>
                      ) : (
                        <span className="candidates-table__resume is-missing">No resume</span>
                      )}
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      {c.screening?.status === 'scored'
                        ? <span style={{ fontWeight: 600, color: c.screening.matchPercent >= 60 ? '#047857' : '#b91c1c' }}>
                            {c.screening.matchPercent}%
                          </span>
                        : '—'}
                    </td>
                    <td>
                      <div className="candidates-table__token">
                        <span className={c.tokenExpiresAt && new Date(c.tokenExpiresAt) < new Date() ? 'is-expired' : ''}>
                          {c.tokenExpiresAt ? `Expires ${relativeFromNow(c.tokenExpiresAt)}` : '—'}
                        </span>
                      </div>
                    </td>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>
                      <div className="candidates-table__actions">
                        {c.status === 'resume_pending' && (
                          <>
                            <Button size="sm" onClick={() => onApprove(c)} loading={actBusy.id === c.id && actBusy.action === 'approve'}>Approve</Button>
                            <Button size="sm" variant="secondary" onClick={() => onDeclineResume(c)} loading={actBusy.id === c.id && actBusy.action === 'decline'}>Decline</Button>
                          </>
                        )}
                        {c.status === 'resume_approved' && (
                          <Button size="sm" onClick={() => onSendTest(c)} loading={actBusy.id === c.id && actBusy.action === 'sendTest'}>Send test</Button>
                        )}
                        {!['resume_pending', 'resume_approved', 'resume_declined'].includes(c.status) && (
                          <Button size="sm" variant="secondary" onClick={() => onCopy(c.testUrl)}>Copy link</Button>
                        )}
                        {!['resume_pending', 'resume_approved', 'resume_declined', 'completed', 'cheated'].includes(c.status) && (
                          <Button size="sm" variant="secondary" onClick={() => onResend(c.id)}>Resend invite</Button>
                        )}
                        {!['resume_pending', 'resume_approved', 'resume_declined', 'in_progress', 'completed', 'cheated'].includes(c.status) && (
                          <Button size="sm" variant="ghost" onClick={() => onRegenerate(c.id)}>Regenerate</Button>
                        )}
                        {c.status === 'awaiting_decision' && (
                          <>
                            <Button size="sm" onClick={() => onSelect(c.id)}>Select</Button>
                            <Button size="sm" variant="ghost" onClick={() => onReject(c.id)}>Reject</Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/candidates/${c.id}`)}>
                          View details
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onDelete(c.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={confirmOverride !== null}
        onClose={() => setConfirmOverride(null)}
        title="Override AI recommendation?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOverride(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!confirmOverride) return;
              if (confirmOverride.action === 'approve') {
                onApprove(confirmOverride.candidate, { skipConfirm: true });
              } else {
                onDeclineResume(confirmOverride.candidate, { skipConfirm: true });
              }
            }}>
              Confirm {confirmOverride?.action === 'approve' ? 'Approve' : 'Decline'}
            </Button>
          </>
        }
      >
        {confirmOverride?.action === 'approve' && (
          <p>AI recommends declining this candidate (match: {confirmOverride.candidate.screening?.matchPercent}%). Approve anyway?</p>
        )}
        {confirmOverride?.action === 'decline' && (
          <p>AI recommends approving this candidate (match: {confirmOverride.candidate.screening?.matchPercent}%). Decline anyway?</p>
        )}
      </Modal>
      <CreateCandidateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

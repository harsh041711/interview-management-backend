import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
} from './candidateSlice';
import CreateCandidateModal from './CreateCandidateModal';
import './CandidateListPage.scss';

const STATUSES = ['', 'pending', 'photo_captured', 'in_progress', 'completed', 'expired', 'cheated'];

export default function CandidateListPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { list, status, meta, error } = useSelector((s) => s.candidates);
  const [filters, setFilters] = useState({ status: '', search: '', page: 1 });
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const params = { page: filters.page, limit: meta.limit };
    if (filters.status) params.status = filters.status;
    if (filters.search.trim()) params.search = filters.search.trim();
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

  const onDelete = async (id) => {
    if (!window.confirm('Delete this candidate? This cannot be undone.')) return;
    const action = await dispatch(deleteCandidate(id));
    if (deleteCandidate.fulfilled.match(action)) {
      push({ type: 'success', message: 'Candidate deleted' });
    }
  };

  return (
    <div className="candidates-page">
      <header className="candidates-page__head">
        <div>
          <h1>Candidates</h1>
          <p className="candidates-page__sub">{meta.total} total · page {meta.page}/{meta.totalPages}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ New candidate</Button>
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
                <th>Token</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="candidates-table__primary">
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
                    </div>
                  </td>
                  <td><StatusBadge status={c.status} /></td>
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
                      <Button size="sm" variant="secondary" onClick={() => onCopy(c.testUrl)}>Copy link</Button>
                      {!['completed', 'cheated'].includes(c.status) && (
                        <Button size="sm" variant="secondary" onClick={() => onResend(c.id)}>Resend invite</Button>
                      )}
                      {!['in_progress', 'completed', 'cheated'].includes(c.status) && (
                        <Button size="sm" variant="ghost" onClick={() => onRegenerate(c.id)}>Regenerate</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onDelete(c.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateCandidateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

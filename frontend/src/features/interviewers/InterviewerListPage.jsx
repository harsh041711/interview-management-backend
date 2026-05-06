import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { formatDate } from '@/utils/formatters';
import { fetchInterviewers, deleteInterviewer } from './interviewerSlice';
import InterviewerFormModal from './InterviewerFormModal';
import './InterviewerListPage.scss';

export default function InterviewerListPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { list, status, meta, error } = useSelector((s) => s.interviewers);

  const [filters, setFilters] = useState({ search: '', isActive: '', page: 1 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const params = { page: filters.page, limit: meta.limit };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.isActive !== '') params.isActive = filters.isActive;
    dispatch(fetchInterviewers(params));
  }, [dispatch, filters, meta.limit]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (interviewer) => { setEditing(interviewer); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this interviewer? This cannot be undone.')) return;
    const action = await dispatch(deleteInterviewer(id));
    if (deleteInterviewer.fulfilled.match(action)) {
      push({ type: 'success', message: 'Interviewer deleted' });
    } else {
      const code = action.payload?.details?.code;
      if (code === 'E_INTERVIEWER_IN_USE') {
        push({ type: 'error', message: 'Cannot delete: this interviewer has scheduled interviews.' });
      } else {
        push({ type: 'error', message: action.payload?.message || 'Failed to delete' });
      }
    }
  };

  return (
    <div className="interviewers-page">
      <header className="interviewers-page__head">
        <div>
          <h1>Interviewers</h1>
          <p className="interviewers-page__sub">{meta.total} total · page {meta.page}/{meta.totalPages}</p>
        </div>
        <Button onClick={openCreate}>+ New interviewer</Button>
      </header>

      <section className="interviewers-page__filters">
        <input
          className="interviewers-page__search"
          type="search"
          placeholder="Search name or email…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
        />
        <select
          value={filters.isActive}
          onChange={(e) => setFilters((f) => ({ ...f, isActive: e.target.value, page: 1 }))}
        >
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </section>

      {status === 'loading' && list.length === 0 ? (
        <Loader message="Loading interviewers…" />
      ) : error ? (
        <EmptyState title="Failed to load" description={error} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No interviewers yet"
          description="Add interviewers to schedule Round 2 interviews."
          action={<Button onClick={openCreate}>+ New interviewer</Button>}
        />
      ) : (
        <div className="interviewers-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Expertise</th>
                <th>Active</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((iv) => (
                <tr key={iv.id}>
                  <td className="interviewers-table__name">{iv.name}</td>
                  <td className="interviewers-table__email">{iv.email}</td>
                  <td>
                    <div className="interviewers-table__chips">
                      {(iv.expertise || []).map((e) => (
                        <span key={e} className="chip">{e}</span>
                      ))}
                      {(iv.expertise || []).length === 0 && <span className="interviewers-table__none">—</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`active-pill ${iv.isActive ? 'active-pill--on' : 'active-pill--off'}`}>
                      {iv.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{formatDate(iv.createdAt)}</td>
                  <td>
                    <div className="interviewers-table__actions">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(iv)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => onDelete(iv.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InterviewerFormModal open={modalOpen} onClose={closeModal} initial={editing} />
    </div>
  );
}

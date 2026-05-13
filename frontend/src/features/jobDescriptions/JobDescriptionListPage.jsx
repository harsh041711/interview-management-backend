import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchJds, deactivateJd } from './jobDescriptionsSlice';
import JobDescriptionFormModal from './JobDescriptionFormModal';
import './JobDescriptionListPage.scss';

export default function JobDescriptionListPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { items, total, totalPages, page, status } = useSelector((s) => s.jds);
  const [filters, setFilters] = useState({ search: '', experience: '', isActive: '' });
  const [modal, setModal] = useState({ open: false, initial: null });

  useEffect(() => {
    dispatch(fetchJds({ page: 1, limit: 20, ...filters }));
  }, [dispatch, filters]);

  const onDeactivate = async (id) => {
    if (!confirm('Deactivate this JD? Already-screened candidates keep their snapshot.')) return;
    const action = await dispatch(deactivateJd(id));
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: 'JD deactivated' });
    }
  };

  return (
    <div className="jd-list">
      <div className="jd-list__head">
        <div>
          <h1 style={{ margin: 0 }}>Job Descriptions</h1>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{total} total · page {page} / {totalPages}</div>
        </div>
        <Button onClick={() => setModal({ open: true, initial: null })}>+ New JD</Button>
      </div>

      <div className="jd-list__filters">
        <input
          placeholder="Search title or tech stack…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}
        />
        <select value={filters.experience} onChange={(e) => setFilters((f) => ({ ...f, experience: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">All experience</option>
          <option value="entry">Entry</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
        </select>
        <select value={filters.isActive} onChange={(e) => setFilters((f) => ({ ...f, isActive: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">Active &amp; inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {status === 'loading' && <Loader message="Loading…" />}
      {status !== 'loading' && items.length === 0 && (
        <EmptyState title="No JDs yet" description="Create one to start screening candidates." />
      )}
      {items.length > 0 && (
        <table className="jd-list__table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Tech / Experience</th>
              <th>Years</th>
              <th>Location</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((jd) => (
              <tr key={jd.id}>
                <td>{jd.title}</td>
                <td>{jd.techStack} / {jd.experience}</td>
                <td>{jd.minYears ?? '—'} – {jd.maxYears ?? '—'}</td>
                <td>{jd.location || '—'}</td>
                <td>
                  <span className={`jd-list__pill ${jd.isActive ? 'jd-list__pill--active' : 'jd-list__pill--inactive'}`}>
                    {jd.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(jd.updatedAt).toLocaleString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="secondary" onClick={() => setModal({ open: true, initial: jd })}>Edit</Button>
                    {jd.isActive && <Button size="sm" variant="ghost" onClick={() => onDeactivate(jd.id)}>Deactivate</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <JobDescriptionFormModal
        open={modal.open}
        initial={modal.initial}
        onClose={() => setModal({ open: false, initial: null })}
      />
    </div>
  );
}

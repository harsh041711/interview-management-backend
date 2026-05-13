import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchProblems, deactivateProblem } from './codingProblemsSlice';
import CodingProblemFormModal from './CodingProblemFormModal';
import './CodingProblemListPage.scss';

export default function CodingProblemListPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { items, total, totalPages, page, status } = useSelector((s) => s.codingProblems);
  const [filters, setFilters] = useState({ search: '', difficulty: '', language: '', source: '', isActive: '' });
  const [modal, setModal] = useState({ open: false, initial: null });

  useEffect(() => {
    dispatch(fetchProblems({ page: 1, limit: 20, ...filters }));
  }, [dispatch, filters]);

  const onDeactivate = async (id) => {
    if (!confirm('Deactivate this problem? Existing candidates that used it keep their submissions.')) return;
    const action = await dispatch(deactivateProblem(id));
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: 'Problem deactivated' });
    }
  };

  return (
    <div className="cp-list">
      <div className="cp-list__head">
        <div>
          <h1 style={{ margin: 0 }}>Coding Problems</h1>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{total} total · page {page} / {totalPages}</div>
        </div>
        <Button onClick={() => setModal({ open: true, initial: null })}>+ New problem</Button>
      </div>

      <div className="cp-list__filters">
        <input
          placeholder="Search title or tech stack…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}
        />
        <select value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">All difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select value={filters.language} onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">All languages</option>
          <option value="js">JavaScript</option>
          <option value="python">Python</option>
          <option value="php">PHP</option>
        </select>
        <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">All sources</option>
          <option value="manual">Manual</option>
          <option value="ai">AI</option>
        </select>
        <select value={filters.isActive} onChange={(e) => setFilters((f) => ({ ...f, isActive: e.target.value }))} style={{ padding: '8px 12px' }}>
          <option value="">Active &amp; inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {status === 'loading' && <Loader message="Loading…" />}
      {status !== 'loading' && items.length === 0 && (
        <EmptyState title="No problems yet" description="Create one to start sending coding tests." />
      )}
      {items.length > 0 && (
        <table className="cp-list__table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Tech / Difficulty</th>
              <th>Languages</th>
              <th>Test cases</th>
              <th>Source</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{(p.techStack || []).join(', ')} / {p.difficulty}</td>
                <td>{(p.supportedLanguages || []).join(', ')}</td>
                <td>{p.testCases?.length || 0}</td>
                <td>
                  <span className={`cp-list__pill cp-list__pill--${p.source}`}>{p.source}</span>
                </td>
                <td>
                  <span className={`cp-list__pill ${p.isActive ? 'cp-list__pill--active' : 'cp-list__pill--inactive'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(p.updatedAt).toLocaleString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="secondary" onClick={() => setModal({ open: true, initial: p })}>Edit</Button>
                    {p.isActive && <Button size="sm" variant="ghost" onClick={() => onDeactivate(p.id)}>Deactivate</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CodingProblemFormModal
        open={modal.open}
        initial={modal.initial}
        onClose={() => setModal({ open: false, initial: null })}
      />
    </div>
  );
}

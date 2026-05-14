import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchProblems, deleteProblem } from './promptProblemSlice';
import PromptProblemForm from './PromptProblemForm';
import './PromptProblemsPage.scss';

const SOURCE_LABELS = {
  manual: 'Manual',
  'ai-personalized': 'AI',
};

export default function PromptProblemsPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { list, status, error } = useSelector((s) => s.promptProblems);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [scope, setScope] = useState('all');  // 'all' | 'library' | 'personalized'

  useEffect(() => { dispatch(fetchProblems({ page: 1, limit: 50, scope })); }, [dispatch, scope]);

  const onDelete = async (id) => {
    if (!window.confirm('Delete this problem?')) return;
    const a = await dispatch(deleteProblem(id));
    if (deleteProblem.fulfilled.match(a)) push({ type: 'success', message: 'Deleted' });
    else push({ type: 'error', message: a.payload?.message || 'Failed' });
  };

  if (status === 'loading' && list.length === 0) return <Loader message="Loading problems…" />;
  if (status === 'failed') return <EmptyState title="Failed" description={error || '—'} />;

  return (
    <div className="prompt-problems">
      <div className="prompt-problems__head">
        <div>
          <h2>Prompt Problems</h2>
          <p className="prompt-problems__sub">Manual library + AI-personalized problems generated for specific candidates.</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ New Problem</Button>
      </div>

      <div className="prompt-problems__filter">
        <button
          type="button"
          className={`prompt-problems__filter-btn ${scope === 'all' ? 'is-active' : ''}`}
          onClick={() => setScope('all')}
        >All</button>
        <button
          type="button"
          className={`prompt-problems__filter-btn ${scope === 'library' ? 'is-active' : ''}`}
          onClick={() => setScope('library')}
        >Library (manual)</button>
        <button
          type="button"
          className={`prompt-problems__filter-btn ${scope === 'personalized' ? 'is-active' : ''}`}
          onClick={() => setScope('personalized')}
        >AI-personalized</button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No prompt problems yet"
          description={scope === 'personalized'
            ? 'AI-personalized problems appear here once you generate one from a candidate detail page.'
            : 'Create one with the button above, or generate one from a candidate detail page.'}
        />
      ) : (
        <table className="prompt-problems__table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>Difficulty</th>
              <th>Tags</th>
              <th>Duration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const personalizedFor = p.createdFor?.name || p.createdFor?.email;
              return (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>
                    <span className={`prompt-problems__source prompt-problems__source--${p.source === 'ai-personalized' ? 'ai' : 'manual'}`}>
                      {SOURCE_LABELS[p.source] || p.source}
                    </span>
                    {personalizedFor && (
                      <span className="prompt-problems__for">for {personalizedFor}</span>
                    )}
                  </td>
                  <td>
                    <span className={`prompt-problems__diff prompt-problems__diff--${p.difficulty}`}>
                      {p.difficulty}
                    </span>
                  </td>
                  <td className="prompt-problems__tags-cell">
                    {(p.tags || []).map((t) => (
                      <span key={t} className="prompt-problems__tag">{t}</span>
                    ))}
                  </td>
                  <td>{p.durationMinutes} min</td>
                  <td className="prompt-problems__actions">
                    <Button size="sm" variant="secondary" onClick={() => { setEditing(p); setFormOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => onDelete(p.id)}>Delete</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <PromptProblemForm
        open={formOpen}
        initial={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
      />
    </div>
  );
}

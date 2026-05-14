import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchProblems, deleteProblem } from './promptProblemSlice';
import PromptProblemForm from './PromptProblemForm';
import './PromptProblemsPage.scss';

export default function PromptProblemsPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { list, status, error } = useSelector((s) => s.promptProblems);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => { dispatch(fetchProblems({ page: 1, limit: 50 })); }, [dispatch]);

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
        <h2>Prompt Problems</h2>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ New Problem</Button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No prompt problems yet" description="Create one with the button above." />
      ) : (
        <table className="prompt-problems__table">
          <thead><tr><th>Title</th><th>Difficulty</th><th>Tags</th><th>Duration</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{p.difficulty}</td>
                <td>{(p.tags || []).join(', ')}</td>
                <td>{p.durationMinutes} min</td>
                <td>
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(p); setFormOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => onDelete(p.id)}>Delete</Button>
                </td>
              </tr>
            ))}
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

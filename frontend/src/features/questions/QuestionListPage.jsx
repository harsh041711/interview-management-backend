import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { fetchQuestions, deleteQuestion, fetchTechStacks } from './questionSlice';
import QuestionFormModal from './QuestionFormModal';
import GenerateQuestionsModal from './GenerateQuestionsModal';
import './QuestionListPage.scss';

const TYPE_LABELS = {
  mcq: 'MCQ',
  multi_select: 'Multi-select',
  one_line: 'One-line',
  descriptive: 'Descriptive',
};

export default function QuestionListPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { list, status, meta, error, techStacks } = useSelector((s) => s.questions);
  const [filters, setFilters] = useState({ techStack: '', type: '', difficulty: '', page: 1 });
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const params = { page: filters.page, limit: meta.limit };
    if (filters.techStack) params.techStack = filters.techStack;
    if (filters.type) params.type = filters.type;
    if (filters.difficulty) params.difficulty = filters.difficulty;
    dispatch(fetchQuestions(params));
  }, [dispatch, filters, meta.limit]);

  // Refresh available tech stacks on mount and whenever the question list changes
  // (so newly added stacks appear in the dropdown automatically).
  useEffect(() => {
    dispatch(fetchTechStacks());
  }, [dispatch, meta.total]);

  const onDelete = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    const action = await dispatch(deleteQuestion(id));
    if (deleteQuestion.fulfilled.match(action)) push({ type: 'success', message: 'Deleted' });
  };

  return (
    <div className="questions-page">
      <header className="questions-page__head">
        <div>
          <h1>Questions</h1>
          <p className="questions-page__sub">{meta.total} total · page {meta.page}/{meta.totalPages}</p>
        </div>
        <div className="questions-page__actions">
          <Button variant="secondary" onClick={() => setGenerateOpen(true)}>✨ AI generate</Button>
          <Button onClick={() => { setEditing(null); setCreateOpen(true); }}>+ New question</Button>
        </div>
      </header>

      <section className="questions-page__filters">
        <select
          value={filters.techStack}
          onChange={(e) => setFilters((f) => ({ ...f, techStack: e.target.value, page: 1 }))}
        >
          <option value="">All tech stacks</option>
          {techStacks.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value, page: 1 }))}>
          <option value="">All difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </section>

      {status === 'loading' && list.length === 0 ? (
        <Loader message="Loading questions…" />
      ) : error ? (
        <EmptyState title="Failed to load" description={error} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No questions yet"
          description="Add manually or generate with Gemini AI for any tech stack."
          action={<Button onClick={() => setGenerateOpen(true)}>✨ Generate with AI</Button>}
        />
      ) : (
        <ul className="question-list">
          {list.map((q) => (
            <li key={q._id} className="question-card">
              <div className="question-card__head">
                <span className={`question-card__type question-card__type--${q.type}`}>{TYPE_LABELS[q.type] || q.type}</span>
                <span className="chip">{q.techStack}</span>
                <span className={`question-card__diff question-card__diff--${q.difficulty}`}>{q.difficulty}</span>
                <span className="question-card__marks">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
                {q.source === 'ai' && <span className="question-card__ai">AI</span>}
              </div>
              <p className="question-card__q">{q.question}</p>
              {Array.isArray(q.options) && q.options.length > 0 && (
                <ol className="question-card__options">
                  {q.options.map((o) => {
                    const correct = q.type === 'multi_select'
                      ? Array.isArray(q.correctAnswer) && q.correctAnswer.includes(o)
                      : q.correctAnswer === o;
                    return (
                      <li key={o} className={correct ? 'is-correct' : ''}>{o}</li>
                    );
                  })}
                </ol>
              )}
              {q.type === 'one_line' && (
                <div className="question-card__meta">
                  <strong>Answer:</strong> {q.correctAnswer}
                  {q.keywords?.length > 0 && <span className="question-card__keywords"> · keywords: {q.keywords.join(', ')}</span>}
                </div>
              )}
              {q.type === 'descriptive' && q.rubric && (
                <div className="question-card__meta"><strong>Rubric:</strong> {q.rubric}</div>
              )}
              <div className="question-card__actions">
                <Button size="sm" variant="secondary" onClick={() => { setEditing(q); setCreateOpen(true); }}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(q._id)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <QuestionFormModal open={createOpen} onClose={() => setCreateOpen(false)} initial={editing} />
      <GenerateQuestionsModal open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </div>
  );
}

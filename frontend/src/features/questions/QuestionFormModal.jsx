import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { createQuestion, updateQuestion } from './questionSlice';
import './QuestionFormModal.scss';

const TYPES = [
  { value: 'mcq', label: 'MCQ (single correct)' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'one_line', label: 'One-line' },
  { value: 'descriptive', label: 'Descriptive' },
];

const blank = {
  techStack: '',
  type: 'mcq',
  question: '',
  options: ['', '', '', ''],
  correctAnswer: '',
  multiCorrect: [],
  keywords: '',
  rubric: '',
  marks: 1,
  difficulty: 'medium',
};

export default function QuestionFormModal({ open, onClose, initial }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        techStack: initial.techStack || '',
        type: initial.type,
        question: initial.question || '',
        options: initial.options?.length ? [...initial.options] : ['', '', '', ''],
        correctAnswer: initial.type === 'multi_select' ? '' : (initial.correctAnswer || ''),
        multiCorrect: initial.type === 'multi_select' && Array.isArray(initial.correctAnswer) ? initial.correctAnswer : [],
        keywords: (initial.keywords || []).join(', '),
        rubric: initial.rubric || '',
        marks: initial.marks ?? 1,
        difficulty: initial.difficulty || 'medium',
      });
    } else {
      setForm(blank);
    }
  }, [open, initial]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setOption = (idx, v) => setForm((f) => {
    const next = [...f.options];
    next[idx] = v;
    return { ...f, options: next };
  });
  const toggleMulti = (opt) => setForm((f) => {
    const exists = f.multiCorrect.includes(opt);
    return { ...f, multiCorrect: exists ? f.multiCorrect.filter((x) => x !== opt) : [...f.multiCorrect, opt] };
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.techStack.trim() || !form.question.trim()) {
      push({ type: 'warn', message: 'Tech stack and question are required' });
      return;
    }
    const payload = {
      techStack: form.techStack.trim(),
      type: form.type,
      question: form.question.trim(),
      marks: Number(form.marks) || 1,
      difficulty: form.difficulty,
    };
    if (form.type === 'mcq') {
      payload.options = form.options.map((o) => o.trim()).filter(Boolean);
      payload.correctAnswer = form.correctAnswer.trim();
      if (payload.options.length < 2 || !payload.correctAnswer || !payload.options.includes(payload.correctAnswer)) {
        push({ type: 'warn', message: 'MCQ needs ≥2 options and a correct answer matching one of them' });
        return;
      }
    } else if (form.type === 'multi_select') {
      payload.options = form.options.map((o) => o.trim()).filter(Boolean);
      payload.correctAnswer = form.multiCorrect.filter((c) => payload.options.includes(c));
      if (payload.options.length < 2 || payload.correctAnswer.length === 0) {
        push({ type: 'warn', message: 'Multi-select needs ≥2 options and at least 1 correct answer' });
        return;
      }
    } else if (form.type === 'one_line') {
      payload.correctAnswer = form.correctAnswer.trim();
      payload.keywords = form.keywords.split(',').map((k) => k.trim()).filter(Boolean);
      if (!payload.correctAnswer) {
        push({ type: 'warn', message: 'One-line answer is required' });
        return;
      }
    } else {
      if (form.rubric.trim()) payload.rubric = form.rubric.trim();
    }

    setBusy(true);
    const action = initial
      ? await dispatch(updateQuestion({ id: initial._id, payload }))
      : await dispatch(createQuestion(payload));
    setBusy(false);
    const ok = initial ? updateQuestion.fulfilled.match(action) : createQuestion.fulfilled.match(action);
    if (ok) {
      push({ type: 'success', message: initial ? 'Question updated' : 'Question created' });
      onClose?.();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed to save' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? 'Edit question' : 'New question'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{initial ? 'Save changes' : 'Create question'}</Button>
        </>
      )}
    >
      <form onSubmit={submit} className="question-form">
        <div className="row">
          <Input label="Tech stack" value={form.techStack} onChange={(e) => setField('techStack', e.target.value)} placeholder="React, Node, Python…" />
          <Input as="select" label="Type" value={form.type} onChange={(e) => setField('type', e.target.value)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Input>
          <Input as="select" label="Difficulty" value={form.difficulty} onChange={(e) => setField('difficulty', e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Input>
          <Input label="Marks" type="number" min="0.25" step="0.25" max="50" value={form.marks} onChange={(e) => setField('marks', e.target.value)} />
        </div>
        <Input as="textarea" label="Question" value={form.question} onChange={(e) => setField('question', e.target.value)} placeholder="Describe the question…" />

        {(form.type === 'mcq' || form.type === 'multi_select') && (
          <div className="options">
            <span className="field__label">Options</span>
            {form.options.map((o, idx) => (
              <div key={idx} className="options__row">
                {form.type === 'mcq' ? (
                  <input
                    type="radio"
                    name="correct"
                    checked={form.correctAnswer === o && !!o}
                    onChange={() => setField('correctAnswer', o)}
                    aria-label="mark correct"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={form.multiCorrect.includes(o) && !!o}
                    onChange={() => toggleMulti(o)}
                    aria-label="mark correct"
                  />
                )}
                <input
                  className="options__input"
                  value={o}
                  onChange={(e) => setOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                />
                <button type="button" className="options__remove" onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }))} aria-label="remove">×</button>
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, options: [...f.options, ''] }))}>+ Add option</Button>
          </div>
        )}

        {form.type === 'one_line' && (
          <>
            <Input label="Correct answer" value={form.correctAnswer} onChange={(e) => setField('correctAnswer', e.target.value)} />
            <Input label="Keywords (comma separated)" value={form.keywords} onChange={(e) => setField('keywords', e.target.value)} hint="Used for fuzzy matching alongside the canonical answer." />
          </>
        )}

        {form.type === 'descriptive' && (
          <Input
            as="textarea"
            label="AI grading rubric (optional)"
            value={form.rubric}
            onChange={(e) => setField('rubric', e.target.value)}
            hint="Short rubric to guide the AI grader (e.g. expected concepts, acceptable trade-offs)."
          />
        )}
      </form>
    </Modal>
  );
}

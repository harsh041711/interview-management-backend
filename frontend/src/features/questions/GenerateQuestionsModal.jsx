import { useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { generateQuestions } from './questionSlice';

const TYPES = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'one_line', label: 'One-line' },
  { value: 'descriptive', label: 'Descriptive' },
];

export default function GenerateQuestionsModal({ open, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [techStack, setTechStack] = useState('');
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('');
  const [types, setTypes] = useState([]);
  const [busy, setBusy] = useState(false);

  const toggleType = (t) => {
    setTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!techStack.trim()) {
      push({ type: 'warn', message: 'Tech stack is required' });
      return;
    }
    setBusy(true);
    const payload = { techStack: techStack.trim(), count: Number(count) || 10, persist: true };
    if (difficulty) payload.difficulty = difficulty;
    if (types.length) payload.types = types;
    const action = await dispatch(generateQuestions(payload));
    setBusy(false);
    if (generateQuestions.fulfilled.match(action)) {
      const { questions, provider, model, source, aiError } = action.payload;
      const n = questions?.length || 0;
      if (source === 'manual_fallback') {
        push({
          type: 'warn',
          message: `AI unavailable — showing ${n} HR-curated question${n === 1 ? '' : 's'} for "${techStack.trim()}"`,
          duration: 6000,
        });
      } else {
        const via = provider ? `${provider}${model ? ` (${model})` : ''}` : 'AI';
        push({ type: 'success', message: `Generated ${n} questions via ${via}` });
      }
      if (aiError) console.warn('AI degraded:', aiError);
      onClose?.();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Generation failed' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate questions with AI"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>✨ Generate</Button>
        </>
      )}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="Tech stack"
          value={techStack}
          onChange={(e) => setTechStack(e.target.value)}
          placeholder="React, Node.js, MERN, Python…"
          required
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Count" type="number" min="1" max="20" value={count} onChange={(e) => setCount(e.target.value)} />
          <Input as="select" label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">Mixed</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Input>
        </div>
        <div className="field">
          <span className="field__label">Question types (optional — leave empty for mix)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => toggleType(t.value)}
                className={`chip-toggle ${types.includes(t.value) ? 'is-on' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <p style={{ color: 'var(--muted, #5b6372)', fontSize: 13 }}>
          Uses Gemini (primary) and Grok (fallback). Generated questions are saved to the question bank.
        </p>
      </form>
    </Modal>
  );
}

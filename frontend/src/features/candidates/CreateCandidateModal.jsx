import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { copyToClipboard } from '@/utils/formatters';
import { createCandidate } from './candidateSlice';
import { fetchTechStacks } from '@/features/questions/questionSlice';
import './CreateCandidateModal.scss';

const MIN_PER_QUESTION = 1.2;

const computeAutoDuration = (count) => Math.max(5, Math.round((Number(count) || 0) * MIN_PER_QUESTION));

const initialForm = () => ({
  name: '',
  email: '',
  questionCount: 10,
  durationMinutes: computeAutoDuration(10),
  durationManual: false,
});

export default function CreateCandidateModal({ open, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const availableStacks = useSelector((s) => s.questions.techStacks);
  const [form, setForm] = useState(initialForm);
  const [stack, setStack] = useState(new Set());
  const [stackInput, setStackInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  // Fetch the list of tech stacks that actually have questions in the bank
  // whenever the modal opens, so HR picks values that match what was loaded.
  useEffect(() => {
    if (open) dispatch(fetchTechStacks());
  }, [open, dispatch]);

  const presets = useMemo(() => {
    if (availableStacks?.length) return availableStacks;
    return ['React', 'Node', 'MERN', 'Frontend', 'Backend', 'TypeScript', 'JavaScript', 'Python'];
  }, [availableStacks]);

  const reset = () => {
    setForm(initialForm());
    setStack(new Set());
    setStackInput('');
    setCreated(null);
  };

  const handleClose = () => { reset(); onClose?.(); };

  const togglePreset = (p) => {
    setStack((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const addStackInput = () => {
    const v = stackInput.trim();
    if (!v) return;
    setStack((prev) => new Set(prev).add(v));
    setStackInput('');
  };

  const removeStack = (s) => {
    setStack((prev) => {
      const next = new Set(prev);
      next.delete(s);
      return next;
    });
  };

  const onCountChange = (raw) => {
    const n = Math.max(1, Math.min(50, Number(raw) || 0));
    setForm((f) => ({
      ...f,
      questionCount: n,
      durationMinutes: f.durationManual ? f.durationMinutes : computeAutoDuration(n),
    }));
  };

  const onDurationChange = (raw) => {
    const n = Math.max(1, Math.min(240, Number(raw) || 0));
    setForm((f) => ({ ...f, durationMinutes: n, durationManual: true }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || stack.size === 0) {
      push({ type: 'warn', message: 'Name, email and at least one tech stack are required' });
      return;
    }
    setBusy(true);
    const action = await dispatch(createCandidate({
      name: form.name,
      email: form.email,
      techStack: [...stack],
      questionCount: Number(form.questionCount) || 10,
      durationMinutes: Number(form.durationMinutes) || computeAutoDuration(form.questionCount),
    }));
    setBusy(false);
    if (createCandidate.fulfilled.match(action)) {
      setCreated(action.payload.candidate);
      push({ type: 'success', message: 'Candidate created' });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed to create candidate' });
    }
  };

  const onCopy = async () => {
    const ok = await copyToClipboard(created.testUrl);
    push({ type: ok ? 'success' : 'error', message: ok ? 'Test link copied' : 'Failed to copy' });
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={created ? 'Test link generated' : 'New candidate'}
      footer={
        created ? (
          <Button onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button onClick={submit} loading={busy}>Create candidate</Button>
          </>
        )
      }
    >
      {created ? (
        <div className="created-summary">
          <p>
            Share this secure link with <strong>{created.name}</strong>.
            They will answer <strong>{created.questionCount}</strong> question{created.questionCount === 1 ? '' : 's'}
            in <strong>{created.durationMinutes}</strong> minute{created.durationMinutes === 1 ? '' : 's'}.
          </p>
          <code className="created-summary__url">{created.testUrl}</code>
          <Button onClick={onCopy} fullWidth variant="secondary">Copy link</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="create-candidate" noValidate>
          <Input
            label="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Jane Doe"
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="jane@example.com"
            required
          />
          <div className="create-candidate__row">
            <Input
              label="Number of questions"
              type="number"
              min="1"
              max="50"
              value={form.questionCount}
              onChange={(e) => onCountChange(e.target.value)}
              hint="Sampled from the question bank for the chosen tech stack."
            />
            <Input
              label="Duration (minutes)"
              type="number"
              min="1"
              max="240"
              value={form.durationMinutes}
              onChange={(e) => onDurationChange(e.target.value)}
              hint={form.durationManual ? 'Manually overridden' : `Auto: ~${MIN_PER_QUESTION} min/question`}
            />
          </div>
          <div className="field">
            <span className="field__label">Tech stack</span>
            <span className="field__hint">
              {availableStacks?.length
                ? 'Pick from stacks that already have questions in the bank.'
                : 'No questions in the bank yet — pick a preset or type your own (you must add matching questions before the candidate starts).'}
            </span>
            <div className="create-candidate__chips">
              {presets.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={`chip-toggle ${stack.has(p) ? 'is-on' : ''}`}
                  onClick={() => togglePreset(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="create-candidate__stack-input">
              <input
                value={stackInput}
                onChange={(e) => setStackInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStackInput(); } }}
                placeholder="Add custom stack and press Enter"
              />
              <Button type="button" size="sm" variant="secondary" onClick={addStackInput}>Add</Button>
            </div>
            {stack.size > 0 && (
              <div className="create-candidate__selected">
                {[...stack].map((s) => (
                  <span key={s} className="chip-toggle is-on" onClick={() => removeStack(s)}>{s} ×</span>
                ))}
              </div>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

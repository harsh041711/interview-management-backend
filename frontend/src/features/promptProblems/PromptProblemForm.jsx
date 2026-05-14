import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { createProblem, updateProblem } from './promptProblemSlice';

const DEFAULT = {
  title: '', description: '', sampleInput: '',
  expectedOutputCriteria: [''],
  customRubricCriteria: [],
  difficulty: 'medium', tags: [], durationMinutes: 20,
};

export default function PromptProblemForm({ open, initial, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [form, setForm] = useState(DEFAULT);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setForm(initial || DEFAULT); }, [initial, open]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCriterion = (arr, i, v) =>
    setField(arr, form[arr].map((c, idx) => (idx === i ? v : c)));
  const addCriterion = (arr) => setField(arr, [...(form[arr] || []), '']);
  const removeCriterion = (arr, i) => setField(arr, form[arr].filter((_, idx) => idx !== i));

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      ...form,
      tags: typeof form.tags === 'string' ? form.tags.split(',').map((s) => s.trim()).filter(Boolean) : form.tags,
      expectedOutputCriteria: (form.expectedOutputCriteria || []).filter(Boolean),
      customRubricCriteria: (form.customRubricCriteria || []).filter(Boolean),
    };
    const action = initial
      ? await dispatch(updateProblem({ id: initial.id, body }))
      : await dispatch(createProblem(body));
    setBusy(false);
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: initial ? 'Updated' : 'Created' });
      onClose();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed' });
    }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Prompt Problem' : 'New Prompt Problem'}>
      <form onSubmit={onSubmit} className="prompt-problem-form">
        <Input label="Title" value={form.title} onChange={(e) => setField('title', e.target.value)} required />

        <label className="prompt-problem-form__label">Scenario description</label>
        <textarea
          className="prompt-problem-form__textarea"
          value={form.description}
          onChange={(e) => setField('description', e.target.value)}
          rows={3}
          required
        />

        <label className="prompt-problem-form__label">Sample input</label>
        <textarea
          className="prompt-problem-form__textarea"
          value={form.sampleInput}
          onChange={(e) => setField('sampleInput', e.target.value)}
          rows={4}
          required
        />

        <label className="prompt-problem-form__label">Expected output criteria</label>
        {(form.expectedOutputCriteria || []).map((c, i) => (
          <div key={i} className="prompt-problem-form__row">
            <Input value={c} onChange={(e) => setCriterion('expectedOutputCriteria', i, e.target.value)} />
            <Button size="sm" variant="ghost" type="button" onClick={() => removeCriterion('expectedOutputCriteria', i)}>×</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" type="button" onClick={() => addCriterion('expectedOutputCriteria')}>+ criterion</Button>

        <label className="prompt-problem-form__label">Custom rubric criteria (optional)</label>
        {(form.customRubricCriteria || []).map((c, i) => (
          <div key={i} className="prompt-problem-form__row">
            <Input value={c} onChange={(e) => setCriterion('customRubricCriteria', i, e.target.value)} />
            <Button size="sm" variant="ghost" type="button" onClick={() => removeCriterion('customRubricCriteria', i)}>×</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" type="button" onClick={() => addCriterion('customRubricCriteria')}>+ rubric item</Button>

        <div className="prompt-problem-form__grid">
          <label className="prompt-problem-form__label">Difficulty
            <select value={form.difficulty} onChange={(e) => setField('difficulty', e.target.value)}>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </label>
          <Input label="Duration (min)" type="number" min={5} max={120}
            value={form.durationMinutes} onChange={(e) => setField('durationMinutes', Number(e.target.value))} />
          <Input label="Tags (comma-separated)" value={Array.isArray(form.tags) ? form.tags.join(', ') : form.tags}
            onChange={(e) => setField('tags', e.target.value)} />
        </div>

        <div className="prompt-problem-form__actions">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button loading={busy} type="submit">{initial ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

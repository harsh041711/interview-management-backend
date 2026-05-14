import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { fetchProblems } from '@/features/promptProblems/promptProblemSlice';
import {
  assignFromLibrary, generateDraft, saveDraftAndAssign, clearDraft,
} from './promptTestSlice';
import './AssignPromptTestModal.scss';

export default function AssignPromptTestModal({ open, onClose, candidateId, onAssigned }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { list: problems } = useSelector((s) => s.promptProblems);
  const { draft, draftStatus, error } = useSelector((s) => s.promptTest);
  const [mode, setMode] = useState('library');  // 'library' | 'ai'
  const [selectedId, setSelectedId] = useState('');
  const [topicOverride, setTopicOverride] = useState('');
  const [difficultyOverride, setDifficultyOverride] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) dispatch(fetchProblems({ page: 1, limit: 100 })); }, [open, dispatch]);
  useEffect(() => { if (draft) setEditing(draft); }, [draft]);
  useEffect(() => { if (!open) { dispatch(clearDraft()); setEditing(null); } }, [open, dispatch]);

  const onAssignFromLibrary = async () => {
    if (!selectedId) return push({ type: 'error', message: 'Pick a problem' });
    setBusy(true);
    const a = await dispatch(assignFromLibrary({ candidateId, problemId: selectedId }));
    setBusy(false);
    if (assignFromLibrary.fulfilled.match(a)) {
      push({ type: 'success', message: 'Assigned' });
      onAssigned?.();
      onClose();
    } else push({ type: 'error', message: a.payload?.message || 'Failed' });
  };

  const onGenerate = async () => {
    setBusy(true);
    const a = await dispatch(generateDraft({ candidateId, topicOverride, difficultyOverride }));
    setBusy(false);
    if (!generateDraft.fulfilled.match(a)) push({ type: 'error', message: a.payload?.message || 'AI failed' });
  };

  const onSaveAndAssign = async () => {
    if (!editing) return;
    setBusy(true);
    const a = await dispatch(saveDraftAndAssign({ candidateId, draft: editing }));
    setBusy(false);
    if (saveDraftAndAssign.fulfilled.match(a)) {
      push({ type: 'success', message: 'Saved and assigned' });
      onAssigned?.();
      onClose();
    } else push({ type: 'error', message: a.payload?.message || 'Failed' });
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Assign Prompt Test">
      <div className="assign-prompt-modal">
        <div className="assign-prompt-modal__tabs">
          <button type="button" className={mode === 'library' ? 'active' : ''} onClick={() => setMode('library')}>Pick from library</button>
          <button type="button" className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>Generate with AI</button>
        </div>

        {mode === 'library' && (
          <>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="assign-prompt-modal__select">
              <option value="">-- pick a problem --</option>
              {problems.map((p) => (
                <option key={p.id} value={p.id}>{p.title} ({p.difficulty}, {p.durationMinutes}m)</option>
              ))}
            </select>
            <div className="assign-prompt-modal__actions">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button loading={busy} onClick={onAssignFromLibrary}>Assign</Button>
            </div>
          </>
        )}

        {mode === 'ai' && !editing && (
          <>
            <Input label="Topic override (optional)" value={topicOverride} onChange={(e) => setTopicOverride(e.target.value)} placeholder="e.g. error-log triage" />
            <label className="assign-prompt-modal__label">Difficulty override (optional)
              <select value={difficultyOverride} onChange={(e) => setDifficultyOverride(e.target.value)}>
                <option value="">— auto —</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <div className="assign-prompt-modal__actions">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button loading={busy || draftStatus === 'loading'} onClick={onGenerate}>Generate</Button>
            </div>
            {draftStatus === 'loading' && <Loader message="AI is drafting…" />}
            {error && <div className="assign-prompt-modal__err">{error}</div>}
          </>
        )}

        {mode === 'ai' && editing && (
          <>
            <Input label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <label className="assign-prompt-modal__label">Description</label>
            <textarea className="assign-prompt-modal__textarea" rows={3}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <label className="assign-prompt-modal__label">Sample input</label>
            <textarea className="assign-prompt-modal__textarea" rows={4}
              value={editing.sampleInput}
              onChange={(e) => setEditing({ ...editing, sampleInput: e.target.value })} />
            <label className="assign-prompt-modal__label">Expected output criteria (one per line)</label>
            <textarea className="assign-prompt-modal__textarea" rows={4}
              value={(editing.expectedOutputCriteria || []).join('\n')}
              onChange={(e) => setEditing({ ...editing, expectedOutputCriteria: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
            <label className="assign-prompt-modal__label">Custom rubric criteria (one per line)</label>
            <textarea className="assign-prompt-modal__textarea" rows={2}
              value={(editing.customRubricCriteria || []).join('\n')}
              onChange={(e) => setEditing({ ...editing, customRubricCriteria: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
            <div className="assign-prompt-modal__actions">
              <Button variant="secondary" onClick={() => { dispatch(clearDraft()); setEditing(null); }}>Discard & regenerate</Button>
              <Button loading={busy} onClick={onSaveAndAssign}>Save & Assign</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

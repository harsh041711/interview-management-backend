import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { createCodingTask } from './codingTasksSlice';
import './SendCodingTaskModal.scss';

const DIFFICULTIES = [
  { value: 'easy',   label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard',   label: 'Hard' },
];

const LANGUAGES = [
  { value: 'js',     label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'php',    label: 'PHP' },
];

const buildPublicUrl = (token) => `${window.location.origin}/coding-task/${token}`;

export default function SendCodingTaskModal({ open, onClose, interviewId }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { busy } = useSelector((s) => s.codingTasks);
  const [difficulty, setDifficulty] = useState('easy');
  const [language, setLanguage] = useState('js');
  const [task, setTask] = useState(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setTask(null); setCopied(false); setDifficulty('easy'); setLanguage('js');
  };

  const handleClose = () => { reset(); onClose?.(); };

  const onGenerate = async () => {
    const a = await dispatch(createCodingTask({ interviewId, difficulty, language }));
    if (createCodingTask.fulfilled.match(a)) {
      setTask(a.payload);
    } else {
      push({ type: 'error', message: a.payload?.message || 'Could not generate problem' });
    }
  };

  const onCopy = async () => {
    if (!task?.token) return;
    try {
      await navigator.clipboard.writeText(buildPublicUrl(task.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      push({ type: 'error', message: 'Copy failed — select the link manually' });
    }
  };

  const sample = task?.problem?.testCases?.find((tc) => !tc.isHidden);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Send coding task"
      size="lg"
      footer={
        task
          ? (
            <>
              <Button variant="secondary" onClick={reset}>Send another</Button>
              <Button onClick={handleClose}>Done</Button>
            </>
          )
          : (
            <>
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button onClick={onGenerate} loading={busy}>Generate</Button>
            </>
          )
      }
    >
      {!task && (
        <div className="send-task__form">
          <p className="send-task__hint">
            AI will generate a fresh problem based on the candidate's JD. You'll get a link to paste into the call chat.
          </p>
          <div className="send-task__row">
            <label className="send-task__field">
              <span>Difficulty</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={busy}>
                {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label className="send-task__field">
              <span>Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {task && (
        <div className="send-task__preview">
          <div className="send-task__pillrow">
            <span className={`send-task__pill send-task__pill--${task.problem.difficulty}`}>{task.problem.difficulty}</span>
            <span className="send-task__pill send-task__pill--lang">{task.problem.language}</span>
          </div>
          <h3 className="send-task__title">{task.problem.title}</h3>
          <pre className="send-task__desc">{task.problem.description}</pre>
          {sample && (
            <div className="send-task__sample">
              <div className="send-task__sample-label">Sample input</div>
              <pre>{sample.stdin}</pre>
              <div className="send-task__sample-label">Sample output</div>
              <pre>{sample.expectedStdout}</pre>
            </div>
          )}
          <div className="send-task__linkrow">
            <input className="send-task__link" readOnly value={buildPublicUrl(task.token)} onFocus={(e) => e.target.select()} />
            <Button onClick={onCopy} variant={copied ? 'success' : 'primary'}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
          </div>
          <p className="send-task__hint">Paste this link in your video call chat. The candidate opens it in their browser.</p>
        </div>
      )}
    </Modal>
  );
}

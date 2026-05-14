import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { fetchCodingTasks, cancelCodingTask, clearCodingTasks } from './codingTasksSlice';
import './CodingTasksPanel.scss';

const POLL_MS = 5000;
const STATUS_LABEL = { pending: 'Sent · waiting', opened: 'Candidate viewing', submitted: 'Submitted', cancelled: 'Cancelled' };

const buildPublicUrl = (token) => `${window.location.origin}/coding-task/${token}`;

function TaskRow({ task, interviewId }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOpen = task.status === 'submitted' && open;
  const canCancel = task.status === 'pending' || task.status === 'opened';

  const onCopy = async () => {
    if (!task.token) return;
    try {
      await navigator.clipboard.writeText(buildPublicUrl(task.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      push({ type: 'error', message: 'Copy failed' });
    }
  };

  const onCancel = async () => {
    const a = await dispatch(cancelCodingTask({ interviewId, taskId: task._id || task.id }));
    if (!cancelCodingTask.fulfilled.match(a)) {
      push({ type: 'error', message: a.payload?.message || 'Could not cancel' });
    }
  };

  return (
    <li className={`coding-tasks__item coding-tasks__item--${task.status}`}>
      <div className="coding-tasks__head">
        <span className="coding-tasks__title">{task.problem?.title || 'Coding task'}</span>
        <span className={`coding-tasks__status coding-tasks__status--${task.status}`}>
          {STATUS_LABEL[task.status] || task.status}
        </span>
      </div>
      <div className="coding-tasks__meta">
        <span className="coding-tasks__pill">{task.problem?.difficulty}</span>
        <span className="coding-tasks__pill coding-tasks__pill--lang">{task.problem?.language}</span>
        {task.submittedAt && (
          <span className="coding-tasks__time">
            Submitted {new Date(task.submittedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="coding-tasks__actions">
        {task.token && task.status !== 'cancelled' && task.status !== 'submitted' && (
          <Button size="sm" variant={copied ? 'success' : 'secondary'} onClick={onCopy}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
        {task.status === 'submitted' && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide submission' : 'View submission'}
          </Button>
        )}
      </div>
      {isOpen && task.submission && (
        <div className="coding-tasks__submission">
          <div className="coding-tasks__summary">
            <strong>{task.submission.summary?.passed ?? 0}</strong> of {task.submission.summary?.total ?? 0} test cases passed
          </div>
          <pre className="coding-tasks__code">{task.submission.code}</pre>
          <ul className="coding-tasks__cases">
            {(task.submission.results || []).map((r, i) => (
              <li key={i} className={r.passed ? 'pass' : 'fail'}>
                <span>Case {i + 1}: {r.passed ? '✓ passed' : '✗ failed'}</span>
                {!r.passed && (
                  <div className="coding-tasks__diff">
                    <div><span>Input:</span><pre>{r.stdin}</pre></div>
                    <div><span>Expected:</span><pre>{r.expectedStdout}</pre></div>
                    <div><span>Got:</span><pre>{r.actualStdout || r.stderr || '(empty)'}</pre></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default function CodingTasksPanel({ interviewId }) {
  const dispatch = useDispatch();
  const { list } = useSelector((s) => s.codingTasks);

  useEffect(() => {
    dispatch(fetchCodingTasks(interviewId));
    const t = setInterval(() => dispatch(fetchCodingTasks(interviewId)), POLL_MS);
    return () => {
      clearInterval(t);
      dispatch(clearCodingTasks());
    };
  }, [interviewId, dispatch]);

  if (!list.length) {
    return (
      <div className="coding-tasks coding-tasks--empty">
        <p>No coding tasks sent yet. Use "Send coding task" up top to share a problem with the candidate.</p>
      </div>
    );
  }

  return (
    <div className="coding-tasks">
      <h3 className="coding-tasks__title-h">Coding tasks</h3>
      <ul className="coding-tasks__list">
        {list.map((t) => (
          <TaskRow key={t._id || t.id} task={t} interviewId={interviewId} />
        ))}
      </ul>
    </div>
  );
}

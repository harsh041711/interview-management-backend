import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { liveCodingTaskApi } from '@/api/liveCodingTaskApi';
import './CodingTaskPage.scss';

const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };
const MONACO_LANG = { js: 'javascript', python: 'python', php: 'php' };

export default function CodingTaskPage() {
  const { token } = useParams();
  const { push } = useToast();

  const [task, setTask] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading'); // 'loading' | 'ready' | 'failed' | 'gone'
  const [loadError, setLoadError] = useState('');

  const [code, setCode] = useState('');
  const [runResults, setRunResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // summary after submit

  useEffect(() => {
    let cancelled = false;
    liveCodingTaskApi.getPublic(token)
      .then((t) => {
        if (cancelled) return;
        setTask(t);
        setCode(t.problem?.starterCode || '');
        setLoadStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        setLoadStatus(status === 410 ? 'gone' : 'failed');
        setLoadError(err?.response?.data?.message || 'Could not load this task.');
      });
    return () => { cancelled = true; };
  }, [token]);

  const onRun = async () => {
    setRunning(true);
    try {
      const out = await liveCodingTaskApi.run(token, code);
      setRunResults(out.results || []);
    } catch (err) {
      push({ type: 'error', message: err?.response?.data?.message || 'Run failed' });
    } finally {
      setRunning(false);
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const out = await liveCodingTaskApi.submit(token, code);
      setSubmitted(out.summary || { passed: 0, total: 0 });
    } catch (err) {
      push({ type: 'error', message: err?.response?.data?.message || 'Submit failed' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadStatus === 'loading') return <Loader message="Loading task…" />;
  if (loadStatus === 'failed' || loadStatus === 'gone') {
    return <EmptyState title="This task isn't available" description={loadError} />;
  }

  if (submitted) {
    return (
      <div className="coding-task__done">
        <h1>Submitted!</h1>
        <p><strong>{submitted.passed}</strong> of {submitted.total} test cases passed.</p>
        <p>Your interviewer has been notified. You can close this tab.</p>
      </div>
    );
  }

  const sampleCases = (task.problem.testCases || []).filter((tc) => !tc.isHidden);

  return (
    <div className="coding-task">
      <header className="coding-task__head">
        <h1>{task.problem.title}</h1>
        <div className="coding-task__pills">
          <span className={`coding-task__pill coding-task__pill--${task.problem.difficulty}`}>{task.problem.difficulty}</span>
          <span className="coding-task__pill coding-task__pill--lang">{LANG_LABEL[task.problem.language] || task.problem.language}</span>
        </div>
      </header>

      <div className="coding-task__body">
        <section className="coding-task__problem">
          <div className="coding-task__desc">
            <ReactMarkdown>{task.problem.description}</ReactMarkdown>
          </div>
          {sampleCases.length > 0 && (
            <div className="coding-task__samples">
              <h3>Sample cases</h3>
              {sampleCases.map((c, i) => (
                <div key={i} className="coding-task__sample">
                  <div><span>Input</span><pre>{c.stdin}</pre></div>
                  <div><span>Output</span><pre>{c.expectedStdout}</pre></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="coding-task__editor">
          <div className="coding-task__editor-shell">
            <div className="coding-task__editor-bar">
              <span className="coding-task__editor-file">solution.{task.problem.language === 'python' ? 'py' : task.problem.language === 'php' ? 'php' : 'js'}</span>
              <span className="coding-task__editor-lang">{LANG_LABEL[task.problem.language] || task.problem.language}</span>
            </div>
            <Editor
              height="58vh"
              language={MONACO_LANG[task.problem.language] || 'javascript'}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
              }}
            />
            <div className="coding-task__editor-actions">
              <Button onClick={onRun} loading={running} variant="secondary">Run</Button>
              <Button onClick={onSubmit} loading={submitting}>Submit</Button>
            </div>
          </div>
          {runResults && (
            <div className="coding-task__output">
              <h3>Run output</h3>
              <ul>
                {runResults.map((r, i) => (
                  <li key={i} className={r.passed ? 'pass' : 'fail'}>
                    <strong>Case {i + 1}:</strong> {r.passed ? '✓ passed' : '✗ failed'}
                    {!r.passed && (
                      <pre>{r.actualStdout || r.stderr || r.error || '(empty)'}</pre>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

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

// Safety net for tasks generated before the AI service was fixed to not wrap
// plain-text output in JSON. If starterCode is a JSON string with a `code`
// field, pull it out; otherwise return as-is.
const normalizeStarter = (raw) => {
  if (!raw || typeof raw !== 'string') return raw || '';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed.code === 'string') return parsed.code;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
  } catch { /* not JSON */ }
  return raw;
};

export default function CodingTaskPage() {
  const { token } = useParams();
  const { push } = useToast();

  const [task, setTask] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading'); // 'loading' | 'ready' | 'failed' | 'gone'
  const [loadError, setLoadError] = useState('');

  const [code, setCode] = useState('');
  const [runResult, setRunResult] = useState(null); // { results: [...] }
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // summary after submit

  useEffect(() => {
    let cancelled = false;
    liveCodingTaskApi.getPublic(token)
      .then((t) => {
        if (cancelled) return;
        setTask(t);
        setCode(normalizeStarter(t.problem?.starterCode));
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
    if (running) return;
    setRunning(true);
    try {
      const out = await liveCodingTaskApi.run(token, code);
      const results = out.results || [];
      setRunResult({ results });
      const passed = results.filter((r) => r.passed).length;
      if (results.length === 0) {
        push({ type: 'info', message: 'No visible test cases to run.' });
      } else if (passed === results.length) {
        push({ type: 'success', message: `All ${results.length} sample case(s) passed` });
      } else {
        push({ type: 'warn', message: `${passed}/${results.length} sample case(s) passed` });
      }
    } catch (err) {
      push({ type: 'error', message: err?.response?.data?.message || 'Run failed' });
    } finally {
      setRunning(false);
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    if (!window.confirm('Submit your final answer? You cannot change it afterwards.')) return;
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
  const passed = runResult ? runResult.results.filter((r) => r.passed).length : 0;
  const total = runResult ? runResult.results.length : 0;

  return (
    <div className="coding-task">
      <div className="coding-task__head">
        <div>
          <div className="coding-task__title">Interview coding task</div>
          <div className="coding-task__subtitle">Write your solution and click Submit when ready.</div>
        </div>
        <span className={`coding-task__difficulty coding-task__difficulty--${task.problem.difficulty}`}>
          {task.problem.difficulty}
        </span>
      </div>

      <div className="coding-task__body">
        <div className="coding-task__left">
          <div className="coding-task__card">
            <div className="coding-task__problem-head">
              <h2 className="coding-task__problem-title">{task.problem.title}</h2>
            </div>
            <div className="coding-task__problem-desc">
              <ReactMarkdown>{task.problem.description || ''}</ReactMarkdown>
            </div>
          </div>

          {sampleCases.length > 0 && (
            <div className="coding-task__card">
              <div className="coding-task__samples-title">
                <span>Examples</span>
                <span className="coding-task__samples-count">{sampleCases.length}</span>
              </div>
              {sampleCases.map((tc, i) => (
                <div key={i} className="coding-task__sample">
                  <div className="coding-task__sample-head">Example {i + 1}</div>
                  <div className="coding-task__sample-row">
                    <span className="coding-task__sample-label">Input</span>
                    <pre className="coding-task__sample-value">{tc.stdin || '(empty)'}</pre>
                  </div>
                  <div className="coding-task__sample-row">
                    <span className="coding-task__sample-label">Output</span>
                    <pre className="coding-task__sample-value">{tc.expectedStdout || '(empty)'}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}

          {runResult && (
            <div className="coding-task__card">
              <div className="coding-task__samples-title">
                <span>Run results</span>
                <span className={`coding-task__samples-count ${
                  passed === total
                    ? 'coding-task__samples-count--pass'
                    : 'coding-task__samples-count--fail'
                }`}>
                  {passed}/{total}
                </span>
              </div>
              {runResult.results.map((r, i) => (
                <div key={i} className={`coding-task__sample coding-task__sample--${r.passed ? 'pass' : 'fail'}`}>
                  <div className="coding-task__sample-head">
                    Example {i + 1} {r.passed ? '✓ Passed' : '✗ Failed'}
                    {typeof r.runtimeMs === 'number' && (
                      <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 11 }}>{r.runtimeMs} ms</span>
                    )}
                  </div>
                  <div className="coding-task__sample-row">
                    <span className="coding-task__sample-label">Input</span>
                    <pre className="coding-task__sample-value">{r.stdin || '(empty)'}</pre>
                  </div>
                  <div className="coding-task__sample-row">
                    <span className="coding-task__sample-label">Expected</span>
                    <pre className="coding-task__sample-value">{r.expectedStdout || '(empty)'}</pre>
                  </div>
                  <div className="coding-task__sample-row">
                    <span className="coding-task__sample-label">Got</span>
                    <pre className="coding-task__sample-value">{r.actualStdout || '(empty)'}</pre>
                  </div>
                  {r.stderr && (
                    <div className="coding-task__sample-row">
                      <span className="coding-task__sample-label">Stderr</span>
                      <pre className="coding-task__sample-value coding-task__sample-value--err">{r.stderr}</pre>
                    </div>
                  )}
                  {r.error && (
                    <div className="coding-task__sample-row">
                      <span className="coding-task__sample-label">Error</span>
                      <pre className="coding-task__sample-value coding-task__sample-value--err">{r.error}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="coding-task__right">
          <div className="coding-task__editor-bar">
            <div className="coding-task__lang-wrap">
              <span>Language:</span>
              <span className="coding-task__lang-fixed">{LANG_LABEL[task.problem.language] || task.problem.language}</span>
            </div>
            <span className="coding-task__editor-hint">Live interview · your interviewer will review your submission</span>
          </div>

          <div className="coding-task__editor-area">
            <Editor
              height="100%"
              theme="vs-dark"
              language={MONACO_LANG[task.problem.language] || 'javascript'}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 2,
                padding: { top: 12 },
              }}
            />
          </div>

          <div className="coding-task__footer">
            <div className="coding-task__footer-hint">
              {runResult ? `Last run: ${passed}/${total} passed` : 'Run your code against the sample cases first.'}
            </div>
            <div className="coding-task__actions">
              <Button variant="secondary" onClick={onRun} loading={running}>▶ Run</Button>
              <Button onClick={onSubmit} loading={submitting}>Submit</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

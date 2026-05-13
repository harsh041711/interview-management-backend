import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import Modal from '@/components/common/Modal';
import { useToast } from '@/components/common/Toast';
import { loadCodingTest, submitCodingTest, clearState } from './codingTestSlice';
import './CodingTestPage.scss';

const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };
const MONACO_LANG = { js: 'javascript', python: 'python', php: 'php' };

const formatMs = (ms) => {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const tabSwitchKey = (token) => `coding-test:${token}:tabSwitches`;

const readStoredTabSwitches = (token) => {
  try {
    const n = parseInt(localStorage.getItem(tabSwitchKey(token)) || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
};

export default function CodingTestPage() {
  const { token } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const { data, status, error, submitting, submitted } = useSelector((s) => s.codingTest);
  const [current, setCurrent] = useState(0);
  const [perProblem, setPerProblem] = useState({});
  const [tabSwitches, setTabSwitches] = useState(() => readStoredTabSwitches(token));
  const [warnOpen, setWarnOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    dispatch(loadCodingTest(token));
    return () => { dispatch(clearState()); };
  }, [dispatch, token]);

  useEffect(() => {
    if (!data?.problems) return;
    setPerProblem((prev) => {
      const next = { ...prev };
      for (const p of data.problems) {
        if (!next[p.id]) {
          const lang = p.supportedLanguages[0];
          next[p.id] = { language: lang, code: p.starterCode?.[lang] || '' };
        }
      }
      return next;
    });
  }, [data]);

  useEffect(() => {
    if (!data || submittedRef.current) return;
    const startedAt = data.firstOpenedAt ? new Date(data.firstOpenedAt).getTime() : Date.now();
    const endsAt = startedAt + data.durationMinutes * 60_000;
    const tick = () => {
      const ms = endsAt - Date.now();
      setRemainingMs(ms);
      if (ms <= 0 && !submittedRef.current) {
        submittedRef.current = true;
        doSubmit(true);
      }
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data) return;
    const onVisibility = () => {
      if (document.hidden) {
        setTabSwitches((n) => {
          const next = n + 1;
          try { localStorage.setItem(tabSwitchKey(token), String(next)); } catch { /* ignore */ }
          return next;
        });
      } else {
        setWarnOpen(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [data, token]);

  useEffect(() => {
    const blockEvt = (e) => { e.preventDefault(); push({ type: 'warn', message: 'Disabled during the test.' }); };
    const onKey = (e) => {
      const isPaste = (e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V');
      const isCopy = (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C');
      if (isPaste || isCopy) blockEvt(e);
    };
    document.addEventListener('paste', blockEvt);
    document.addEventListener('copy', blockEvt);
    document.addEventListener('contextmenu', blockEvt);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('paste', blockEvt);
      document.removeEventListener('copy', blockEvt);
      document.removeEventListener('contextmenu', blockEvt);
      document.removeEventListener('keydown', onKey);
    };
  }, [push]);

  if (status === 'loading' && !data) return <Loader message="Loading coding test…" />;
  if (status === 'failed' || !data) {
    return <EmptyState title="Couldn't load the test" description={error || 'The link may be invalid or expired.'} />;
  }
  if (data.submittedAt || submitted) {
    return <EmptyState title="You've already submitted this test" description="Thanks — the hiring team will be in touch." />;
  }

  const problem = data.problems[current];
  const state = perProblem[problem.id] || { language: problem.supportedLanguages[0], code: '' };

  const setLang = (newLang) => {
    if (state.code.trim() && state.code !== (problem.starterCode?.[state.language] || '')) {
      if (!window.confirm(`Switching to ${LANG_LABEL[newLang]} will replace your current code with the starter code. Continue?`)) return;
    }
    setPerProblem((prev) => ({
      ...prev,
      [problem.id]: { language: newLang, code: problem.starterCode?.[newLang] || '' },
    }));
  };

  const setCode = (code) => {
    setPerProblem((prev) => ({ ...prev, [problem.id]: { ...prev[problem.id], code } }));
  };

  const doSubmit = async (autoSubmitted = false) => {
    if (submittedRef.current && !autoSubmitted) return;
    submittedRef.current = true;
    const submissions = data.problems.map((p) => ({
      problemId: p.id,
      language: perProblem[p.id]?.language || p.supportedLanguages[0],
      code: perProblem[p.id]?.code || '',
    }));
    const action = await dispatch(submitCodingTest({ token, submissions, tabSwitches, autoSubmitted }));
    if (submitCodingTest.fulfilled.match(action)) {
      try { localStorage.removeItem(tabSwitchKey(token)); } catch { /* ignore */ }
      push({ type: 'success', message: 'Submitted!' });
      navigate(`/coding-test/${token}/submitted`, { replace: true });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Submit failed' });
      submittedRef.current = false;
    }
  };

  const timerWarn = remainingMs !== null && remainingMs < 60_000;
  const tabSwClass = tabSwitches === 0
    ? ''
    : tabSwitches <= 3
      ? 'coding-test__tabsw--warn'
      : 'coding-test__tabsw--danger';

  return (
    <div className="coding-test">
      <div className="coding-test__head">
        <div>
          <div className="coding-test__title">Coding Challenge — {data.candidate?.name || 'Candidate'}</div>
          <div className="coding-test__counter">
            <span>Problem {current + 1} of {data.problems.length}</span>
            <span className={`coding-test__tabsw ${tabSwClass}`}>
              👁 Tab switches: {tabSwitches}
            </span>
          </div>
        </div>
        <div className={`coding-test__timer ${timerWarn ? 'coding-test__timer--warn' : ''}`}>
          <span>⏱</span>
          <span>{remainingMs !== null ? formatMs(remainingMs) : '…'}</span>
        </div>
      </div>

      <div className="coding-test__body">
        <div className="coding-test__left">
          <div className="coding-test__card">
            <div className="coding-test__problem-head">
              <div className="coding-test__problem-row">
                <h2 className="coding-test__problem-title">{problem.title}</h2>
                <span className={`coding-test__difficulty coding-test__difficulty--${problem.difficulty}`}>
                  {problem.difficulty}
                </span>
              </div>
            </div>
            <div className="coding-test__problem-desc">
              <ReactMarkdown>{problem.description || ''}</ReactMarkdown>
            </div>
          </div>

          {problem.sampleCases?.length > 0 && (
            <div className="coding-test__card">
              <div className="coding-test__samples-title">
                <span>Examples</span>
                <span className="coding-test__samples-count">{problem.sampleCases.length}</span>
              </div>
              {problem.sampleCases.map((tc, i) => (
                <div key={i} className="coding-test__sample">
                  <div className="coding-test__sample-head">Example {i + 1}</div>
                  <div className="coding-test__sample-row">
                    <span className="coding-test__sample-label">Input</span>
                    <pre className="coding-test__sample-value">{tc.stdin || '(empty)'}</pre>
                  </div>
                  <div className="coding-test__sample-row">
                    <span className="coding-test__sample-label">Output</span>
                    <pre className="coding-test__sample-value">{tc.expectedStdout || '(empty)'}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="coding-test__right">
          <div className="coding-test__editor-bar">
            <div className="coding-test__lang-wrap">
              <span>Language:</span>
              <select
                className="coding-test__lang-select"
                value={state.language}
                onChange={(e) => setLang(e.target.value)}
              >
                {problem.supportedLanguages.map((l) => (
                  <option key={l} value={l}>{LANG_LABEL[l]}</option>
                ))}
              </select>
            </div>
            <span className="coding-test__editor-hint">
              Pasting disabled · Tab switches tracked
            </span>
          </div>

          <div className="coding-test__editor-area">
            <Editor
              height="100%"
              theme="vs-dark"
              language={MONACO_LANG[state.language]}
              value={state.code}
              onChange={(v) => setCode(v || '')}
              options={{
                minimap: { enabled: false },
                contextmenu: false,
                fontSize: 14,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 12 },
              }}
              onMount={(editor) => {
                editor.onDidPaste(() => {
                  push({ type: 'warn', message: 'Pasting is disabled. Please type your code.' });
                });
              }}
            />
          </div>

          <div className="coding-test__footer">
            <div className="coding-test__progress">
              {data.problems.map((_, i) => (
                <span
                  key={i}
                  className={`coding-test__progress-dot ${i === current ? 'is-current' : i < current ? 'is-done' : ''}`}
                />
              ))}
              <span style={{ marginLeft: 8 }}>{current + 1} / {data.problems.length}</span>
            </div>
            <div className="coding-test__actions">
              <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>← Previous</Button>
              {current < data.problems.length - 1 && (
                <Button onClick={() => setCurrent((c) => c + 1)}>Next →</Button>
              )}
              {current === data.problems.length - 1 && (
                <Button onClick={() => doSubmit(false)} loading={submitting}>Submit and finish</Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="Tab switch detected"
        footer={<Button onClick={() => setWarnOpen(false)}>OK</Button>}
      >
        <p>
          You left the test tab. Tab switching is monitored. This is switch <strong>#{tabSwitches}</strong>.
          Please stay focused on the test.
        </p>
      </Modal>
    </div>
  );
}

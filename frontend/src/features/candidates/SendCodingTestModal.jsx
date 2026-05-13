import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { candidateApi } from '@/api/candidateApi';
import { codingProblemApi } from '@/api/codingProblemApi';
import './SendCodingTestModal.scss';

const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function SendCodingTestModal({ open, candidateId, onClose, onSent }) {
  const { push } = useToast();
  const [mode, setMode] = useState('auto'); // 'auto' | 'manual'
  const [form, setForm] = useState({ problemCount: 1, durationMinutes: 30, difficulty: 'medium' });
  const [busy, setBusy] = useState(false);

  // Manual-pick state
  const [problems, setProblems] = useState(null);
  const [problemsErr, setProblemsErr] = useState(null);
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (!open) {
      // Reset on close so the next open starts fresh.
      setMode('auto');
      setForm({ problemCount: 1, durationMinutes: 30, difficulty: 'medium' });
      setProblems(null);
      setSearch('');
      setDiffFilter('');
      setSelectedIds(new Set());
    }
  }, [open]);

  // Lazy-load the problem bank when switching into manual mode.
  useEffect(() => {
    if (!open || mode !== 'manual' || problems !== null) return;
    setProblemsErr(null);
    codingProblemApi.list({ page: 1, limit: 100, isActive: 'true' })
      .then((res) => setProblems(res.items || []))
      .catch((err) => setProblemsErr(err.response?.data?.message || 'Failed to load problems'));
  }, [open, mode, problems]);

  const filtered = useMemo(() => {
    if (!problems) return [];
    const term = search.trim().toLowerCase();
    return problems.filter((p) => {
      if (diffFilter && p.difficulty !== diffFilter) return false;
      if (!term) return true;
      const hay = `${p.title} ${(p.techStack || []).join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
  }, [problems, search, diffFilter]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      else push({ type: 'warn', message: 'Max 5 problems per test' });
      return next;
    });
  };

  const submit = async () => {
    if (mode === 'manual' && selectedIds.size === 0) {
      push({ type: 'warn', message: 'Pick at least one problem' });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        durationMinutes: Number(form.durationMinutes),
      };
      if (mode === 'manual') {
        payload.problemIds = [...selectedIds];
      } else {
        payload.problemCount = Number(form.problemCount);
        payload.difficulty = form.difficulty;
      }
      await candidateApi.sendCodingTest(candidateId, payload);
      push({ type: 'success', message: 'Coding test sent — candidate will receive an email shortly' });
      onSent?.();
      onClose();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Failed to send coding test' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send coding test"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>
            {mode === 'manual'
              ? `Send ${selectedIds.size || 0} problem${selectedIds.size === 1 ? '' : 's'}`
              : 'Send coding test'}
          </Button>
        </>
      )}
    >
      <div className="send-coding">
        {/* Mode toggle */}
        <div className="send-coding__mode">
          <button
            type="button"
            className={`send-coding__mode-btn ${mode === 'auto' ? 'is-on' : ''}`}
            onClick={() => setMode('auto')}
          >
            <div className="send-coding__mode-title">⚡ Auto-select</div>
            <div className="send-coding__mode-sub">Pick problems from the bank by difficulty</div>
          </button>
          <button
            type="button"
            className={`send-coding__mode-btn ${mode === 'manual' ? 'is-on' : ''}`}
            onClick={() => setMode('manual')}
          >
            <div className="send-coding__mode-title">✓ Manual select</div>
            <div className="send-coding__mode-sub">Pick specific problems yourself</div>
          </button>
        </div>

        {/* Auto mode fields */}
        {mode === 'auto' && (
          <div className="send-coding__fields">
            <Input
              label="Number of problems (1–5)"
              type="number" min="1" max="5"
              value={form.problemCount}
              onChange={(e) => setForm({ ...form, problemCount: e.target.value })}
            />
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Difficulty</label>
              <select
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                style={{ width: '100%', padding: '8px 10px' }}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
        )}

        {/* Manual mode: problem picker */}
        {mode === 'manual' && (
          <div className="send-coding__manual">
            <div className="send-coding__manual-filters">
              <input
                className="send-coding__search"
                placeholder="Search title or tech stack…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                value={diffFilter}
                onChange={(e) => setDiffFilter(e.target.value)}
                style={{ padding: '8px 10px' }}
              >
                <option value="">All difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="send-coding__counter">
              {selectedIds.size} of 5 selected
            </div>

            {problemsErr && <div className="send-coding__error">{problemsErr}</div>}
            {!problemsErr && problems === null && <Loader message="Loading problems…" />}
            {!problemsErr && problems !== null && filtered.length === 0 && (
              <div className="send-coding__empty">No active problems match your filters.</div>
            )}

            {filtered.length > 0 && (
              <div className="send-coding__list">
                {filtered.map((p) => {
                  const checked = selectedIds.has(p.id);
                  return (
                    <label key={p.id} className={`send-coding__row ${checked ? 'is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(p.id)}
                      />
                      <div className="send-coding__row-body">
                        <div className="send-coding__row-title">{p.title}</div>
                        <div className="send-coding__row-meta">
                          <span className={`send-coding__diff send-coding__diff--${p.difficulty}`}>
                            {DIFF_LABEL[p.difficulty] || p.difficulty}
                          </span>
                          <span className="send-coding__stack">
                            {(p.techStack || []).join(', ')}
                          </span>
                          <span className="send-coding__lang">
                            {(p.supportedLanguages || []).join(' · ')}
                          </span>
                          {p.source === 'ai' && <span className="send-coding__ai">AI</span>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Always-shown: duration */}
        <Input
          label="Duration (minutes)"
          type="number" min="5" max="240"
          value={form.durationMinutes}
          onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
        />
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Editor from '@monaco-editor/react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { codingProblemApi } from '@/api/codingProblemApi';
import { createProblem, updateProblem, fetchProblems } from './codingProblemsSlice';
import './CodingProblemFormModal.scss';

const LANGS = ['js', 'python', 'php'];
const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };
const MONACO_LANG = { js: 'javascript', python: 'python', php: 'php' };

const EMPTY = {
  title: '',
  description: '',
  difficulty: 'medium',
  techStack: '',
  supportedLanguages: ['js'],
  starterCode: { js: '', python: '', php: '' },
  testCases: [{ stdin: '', expectedStdout: '', isHidden: false }],
};

export default function CodingProblemFormModal({ open, initial, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { busy } = useSelector((s) => s.codingProblems);
  const [form, setForm] = useState(EMPTY);
  const [aiTopic, setAiTopic] = useState('');
  const [aiBusy, setAiBusy] = useState(null);
  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        ...EMPTY,
        ...initial,
        techStack: (initial.techStack || []).join(', '),
        starterCode: { js: '', python: '', php: '', ...(initial.starterCode || {}) },
        testCases: initial.testCases?.length ? initial.testCases : EMPTY.testCases,
      });
    } else {
      setForm(EMPTY);
    }
    setAiTopic('');
  }, [open, initial]);

  const toggleLang = (lang) => {
    setForm((f) => {
      const has = f.supportedLanguages.includes(lang);
      const next = has ? f.supportedLanguages.filter((x) => x !== lang) : [...f.supportedLanguages, lang];
      return { ...f, supportedLanguages: next.length > 0 ? next : f.supportedLanguages };
    });
  };

  const setStarter = (lang, code) =>
    setForm((f) => ({ ...f, starterCode: { ...f.starterCode, [lang]: code } }));

  const setTc = (i, field, value) =>
    setForm((f) => {
      const next = [...f.testCases];
      next[i] = { ...next[i], [field]: value };
      return { ...f, testCases: next };
    });

  const addTc = () =>
    setForm((f) => ({ ...f, testCases: [...f.testCases, { stdin: '', expectedStdout: '', isHidden: true }] }));

  const removeTc = (i) =>
    setForm((f) => ({ ...f, testCases: f.testCases.filter((_, idx) => idx !== i) }));

  const onAiStarter = async (lang) => {
    if (!form.description.trim()) {
      push({ type: 'warn', message: 'Write the description first' });
      return;
    }
    setAiBusy(`starter-${lang}`);
    try {
      const { code } = await codingProblemApi.aiStarterCode({ description: form.description, language: lang });
      setStarter(lang, code);
      push({ type: 'success', message: `Starter code generated for ${LANG_LABEL[lang]}` });
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'AI generation failed' });
    } finally {
      setAiBusy(null);
    }
  };

  const onAiFull = async () => {
    if (!aiTopic.trim()) {
      push({ type: 'warn', message: 'Enter a topic for AI generation' });
      return;
    }
    setAiBusy('full');
    try {
      const draft = await codingProblemApi.aiFullProblem({
        topic: aiTopic, difficulty: form.difficulty, languages: form.supportedLanguages,
      });
      setForm((f) => ({
        ...f,
        title: draft.title,
        description: draft.description,
        starterCode: { ...f.starterCode, ...draft.starterCode },
        testCases: draft.testCases,
      }));
      push({ type: 'success', message: 'Full problem drafted by AI' });
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'AI generation failed' });
    } finally {
      setAiBusy(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const techStack = form.techStack.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!form.title || !form.description || techStack.length === 0 || form.supportedLanguages.length === 0) {
      push({ type: 'warn', message: 'Fill in title, description, tech stack, and at least one language' });
      return;
    }
    const payload = {
      title: form.title,
      description: form.description,
      difficulty: form.difficulty,
      techStack,
      supportedLanguages: form.supportedLanguages,
      starterCode: form.starterCode,
      testCases: form.testCases.filter((tc) => tc.stdin !== '' || tc.expectedStdout !== ''),
    };
    const action = isEdit
      ? await dispatch(updateProblem({ id: initial.id, payload }))
      : await dispatch(createProblem(payload));
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: isEdit ? 'Problem updated' : 'Problem created' });
      dispatch(fetchProblems({ page: 1, limit: 20 }));
      onClose();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Coding Problem' : 'New Coding Problem'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{isEdit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="cp-form" noValidate>
        <div className="cp-form__ai">
          <div style={{ flex: 1 }}>
            <Input
              label="AI generate from topic"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="e.g. 'sum of n numbers'"
            />
          </div>
          <Button type="button" variant="secondary" onClick={onAiFull} loading={aiBusy === 'full'}>
            Generate entire problem
          </Button>
        </div>

        <Input
          label="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />

        <div className="cp-form__row">
          <Input
            label="Tech stack (comma-separated)"
            value={form.techStack}
            onChange={(e) => setForm({ ...form, techStack: e.target.value })}
            placeholder="react, frontend, javascript"
            required
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
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Languages</label>
            <div className="cp-form__chips">
              {LANGS.map((l) => (
                <button
                  type="button"
                  key={l}
                  className={`cp-form__chip ${form.supportedLanguages.includes(l) ? 'is-on' : ''}`}
                  onClick={() => toggleLang(l)}
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Description (markdown supported)</label>
          <textarea
            rows={6}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ width: '100%', resize: 'vertical', padding: 8, fontFamily: 'inherit' }}
          />
        </div>

        {form.supportedLanguages.map((lang) => (
          <div key={lang}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 13 }}>Starter code — {LANG_LABEL[lang]}</label>
              <Button type="button" size="sm" variant="ghost" onClick={() => onAiStarter(lang)} loading={aiBusy === `starter-${lang}`}>
                Generate with AI
              </Button>
            </div>
            <div className="cp-form__editor">
              <Editor
                height="200px"
                language={MONACO_LANG[lang]}
                value={form.starterCode[lang] || ''}
                onChange={(value) => setStarter(lang, value || '')}
                options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
              />
            </div>
          </div>
        ))}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ fontSize: 13 }}>Test cases ({form.testCases.length})</label>
            <Button type="button" size="sm" variant="secondary" onClick={addTc}>+ Add case</Button>
          </div>
          {form.testCases.map((tc, i) => (
            <div key={i} className="cp-form__tc">
              <textarea
                rows={3}
                placeholder="stdin"
                value={tc.stdin}
                onChange={(e) => setTc(i, 'stdin', e.target.value)}
              />
              <textarea
                rows={3}
                placeholder="expected stdout"
                value={tc.expectedStdout}
                onChange={(e) => setTc(i, 'expectedStdout', e.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={tc.isHidden}
                  onChange={(e) => setTc(i, 'isHidden', e.target.checked)}
                />
                hidden
              </label>
              <Button type="button" size="sm" variant="ghost" onClick={() => removeTc(i)}>x</Button>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}

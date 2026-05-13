import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { createCandidate, uploadCandidateResume } from './candidateSlice';
import { fetchTechStacks } from '@/features/questions/questionSlice';
import './CreateCandidateModal.scss';

const RESUME_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const RESUME_MAX_BYTES = 5 * 1024 * 1024;

const MIN_PER_QUESTION = 1.2;

const computeAutoDuration = (count) => Math.max(5, Math.round((Number(count) || 0) * MIN_PER_QUESTION));

const initialForm = () => ({
  name: '',
  email: '',
  questionCount: 10,
  durationMinutes: computeAutoDuration(10),
  durationManual: false,
  experience: 'mid',
});

export default function CreateCandidateModal({ open, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const availableStacks = useSelector((s) => s.questions.techStacks);
  const [form, setForm] = useState(initialForm);
  const [stack, setStack] = useState(new Set());
  const [stackInput, setStackInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [scanPhase, setScanPhase] = useState(null); // 'creating' | 'uploading' | 'scanning' | 'matching'
  const [resumePreviewUrl, setResumePreviewUrl] = useState(null);
  const resumeInputRef = useRef(null);

  // Generate (and clean up) an object URL for previewing the resume during scan.
  useEffect(() => {
    if (!resumeFile) {
      setResumePreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(resumeFile);
    setResumePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resumeFile]);

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
    setResumeFile(null);
    if (resumeInputRef.current) resumeInputRef.current.value = '';
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

  const onResumeChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setResumeFile(null);
      return;
    }
    if (!RESUME_MIME.includes(file.type)) {
      push({ type: 'error', message: 'Resume must be PDF, DOC, or DOCX' });
      e.target.value = '';
      return;
    }
    if (file.size > RESUME_MAX_BYTES) {
      push({ type: 'error', message: 'Resume must be 5 MB or smaller' });
      e.target.value = '';
      return;
    }
    setResumeFile(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || stack.size === 0) {
      push({ type: 'warn', message: 'Name, email and at least one tech stack are required' });
      return;
    }
    setBusy(true);
    setScanPhase(resumeFile ? 'creating' : null);

    const action = await dispatch(createCandidate({
      name: form.name,
      email: form.email,
      techStack: [...stack],
      questionCount: Number(form.questionCount) || 10,
      durationMinutes: Number(form.durationMinutes) || computeAutoDuration(form.questionCount),
      experience: form.experience,
    }));
    if (!createCandidate.fulfilled.match(action)) {
      setBusy(false);
      setScanPhase(null);
      push({ type: 'error', message: action.payload?.message || 'Failed to create candidate' });
      return;
    }
    const candidate = action.payload.candidate;

    if (resumeFile) {
      // Phase progression: upload → scan (the long visible portion) → match (final).
      setScanPhase('uploading');
      const toScan = setTimeout(() => setScanPhase('scanning'), 600);

      const uploadPromise = dispatch(uploadCandidateResume({ id: candidate.id, file: resumeFile }));
      const upload = await uploadPromise;

      // The backend already finished — flash a brief 'matching' phase so the last step
      // visibly lights up before the modal closes.
      clearTimeout(toScan);
      setScanPhase('matching');
      await new Promise((r) => setTimeout(r, 500));

      if (uploadCandidateResume.fulfilled.match(upload)) {
        const scr = upload.payload.candidate?.screening;
        const msg =
          scr?.status === 'scored' ? `Candidate created — screening complete (match: ${scr.matchPercent}%)`
          : scr?.status === 'skipped' ? 'Candidate created — no matching JD, screening skipped'
          : scr?.status === 'failed' ? 'Candidate created — AI screening unavailable, review manually'
          : 'Candidate created — resume uploaded';
        push({ type: 'success', message: msg });
      } else {
        push({
          type: 'warn',
          message: upload.payload?.message || 'Candidate created but resume upload failed',
        });
      }
    } else {
      push({ type: 'success', message: 'Candidate created — upload a resume to start screening' });
    }

    setBusy(false);
    setScanPhase(null);
    handleClose();
  };

  const PHASE_LABELS = {
    creating: { title: 'Creating candidate record…', step: 1 },
    uploading: { title: 'Uploading resume to secure storage…', step: 2 },
    scanning: { title: 'Scanning resume content…', step: 3 },
    matching: { title: 'Matching against job descriptions…', step: 4 },
  };

  const ScanView = () => {
    const meta = PHASE_LABELS[scanPhase] || PHASE_LABELS.creating;
    const isPdf = resumeFile?.type === 'application/pdf';
    return (
      <div className="resume-scan">
        <div className="resume-scan__doc">
          {isPdf && resumePreviewUrl ? (
            <iframe
              key={resumePreviewUrl}
              src={`${resumePreviewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title="Resume preview"
              className="resume-scan__pdf"
            />
          ) : (
            <div className="resume-scan__paper">
              <div className="resume-scan__file-icon">📄</div>
              <div className="resume-scan__filename">{resumeFile?.name || 'resume'}</div>
              <div className="resume-scan__filesize">
                {resumeFile ? `${(resumeFile.size / 1024).toFixed(0)} KB` : ''}
              </div>
              <div className="resume-scan__line resume-scan__line--title" />
              <div className="resume-scan__line" />
              <div className="resume-scan__line resume-scan__line--short" />
              <div className="resume-scan__line resume-scan__line--medium" />
              <div className="resume-scan__line" />
              <div className="resume-scan__line resume-scan__line--short" />
            </div>
          )}
          <div className="resume-scan__beam" />
          <div className="resume-scan__glow" />
        </div>
        <div className="resume-scan__status">
          <div className="resume-scan__title">{meta.title}</div>
          <div className="resume-scan__steps">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`resume-scan__step ${
                  n < meta.step ? 'is-done' : n === meta.step ? 'is-current' : ''
                }`}
              >
                <span className="resume-scan__step-dot">{n < meta.step ? '✓' : n}</span>
                <span className="resume-scan__step-label">
                  {n === 1 && 'Create'}
                  {n === 2 && 'Upload'}
                  {n === 3 && 'Scan'}
                  {n === 4 && 'Match'}
                </span>
              </div>
            ))}
          </div>
          <div className="resume-scan__hint">
            This usually takes 5–15 seconds. Hang tight.
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={scanPhase ? () => {} : handleClose}
      title={scanPhase ? 'Processing resume' : 'New candidate'}
      footer={
        scanPhase ? null : (
          <>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button onClick={submit} loading={busy}>Create candidate</Button>
          </>
        )
      }
    >
      {scanPhase ? <ScanView /> : (
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
          <div className="field">
            <span className="field__label">Experience</span>
            <div className="create-candidate__exp">
              {['entry', 'mid', 'senior'].map((e) => (
                <button type="button" key={e}
                  className={`chip-toggle ${form.experience === e ? 'is-on' : ''}`}
                  onClick={() => setForm({ ...form, experience: e })}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label">Resume <span className="field__optional">(optional)</span></span>
            <span className="field__hint">
              PDF, DOC, or DOCX up to 5 MB. Sent to the interviewer when Round 2 is scheduled.
            </span>
            <input
              ref={resumeInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onResumeChange}
              className="create-candidate__file"
            />
            {resumeFile && (
              <div className="create-candidate__file-meta">
                {resumeFile.name} · {(resumeFile.size / 1024).toFixed(0)} KB
                <button
                  type="button"
                  className="create-candidate__file-clear"
                  onClick={() => {
                    setResumeFile(null);
                    if (resumeInputRef.current) resumeInputRef.current.value = '';
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

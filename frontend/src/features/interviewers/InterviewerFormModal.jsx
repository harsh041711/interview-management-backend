import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { createInterviewer, updateInterviewer } from './interviewerSlice';
import './InterviewerFormModal.scss';

const initialForm = () => ({
  name: '',
  email: '',
  expertiseRaw: '',   // comma-separated
  notes: '',
  isActive: true,
});

export default function InterviewerFormModal({ open, onClose, initial }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);

  const isEdit = !!initial;

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          name: initial.name || '',
          email: initial.email || '',
          expertiseRaw: (initial.expertise || []).join(', '),
          notes: initial.notes || '',
          isActive: initial.isActive !== false,
        });
      } else {
        setForm(initialForm());
      }
    }
  }, [open, initial]);

  const handleClose = () => {
    setForm(initialForm());
    onClose?.();
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      push({ type: 'warn', message: 'Name and email are required.' });
      return;
    }
    const expertise = form.expertiseRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      expertise,
      notes: form.notes.trim() || undefined,
    };

    if (isEdit) {
      payload.isActive = form.isActive;
    }

    setBusy(true);
    const action = isEdit
      ? await dispatch(updateInterviewer({ id: initial.id, payload }))
      : await dispatch(createInterviewer(payload));
    setBusy(false);

    if (
      (isEdit ? updateInterviewer : createInterviewer).fulfilled.match(action)
    ) {
      push({ type: 'success', message: isEdit ? 'Interviewer updated' : 'Interviewer created' });
      handleClose();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed to save interviewer' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Edit interviewer' : 'New interviewer'}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{isEdit ? 'Save changes' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="interviewer-form" noValidate>
        <Input
          label="Full name"
          value={form.name}
          onChange={set('name')}
          placeholder="Jane Smith"
          required
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="jane@company.com"
          required
          disabled={isEdit}
        />
        <Input
          label="Expertise (comma-separated)"
          value={form.expertiseRaw}
          onChange={set('expertiseRaw')}
          placeholder="React, Node, TypeScript"
          hint="e.g. React, Node, System Design"
        />
        <Input
          label="Notes (optional)"
          as="textarea"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Any additional notes…"
        />
        {isEdit && (
          <label className="interviewer-form__toggle field">
            <span className="field__label">Active</span>
            <select
              className="field__input"
              value={form.isActive ? 'true' : 'false'}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === 'true' }))}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        )}
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { createJd, updateJd, fetchJds } from './jobDescriptionsSlice';

const EMPTY = {
  title: '',
  techStack: '',
  experience: 'mid',
  jobRole: '',
  responsibilities: '',
  qualifications: '',
  niceToHave: '',
  minYears: '',
  maxYears: '',
  location: '',
};

export default function JobDescriptionFormModal({ open, initial, onClose }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { busy } = useSelector((s) => s.jds);
  const [form, setForm] = useState(EMPTY);
  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (open) setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
  }, [open, initial]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      techStack: form.techStack.toLowerCase().trim(),
      minYears: form.minYears === '' ? null : Number(form.minYears),
      maxYears: form.maxYears === '' ? null : Number(form.maxYears),
    };
    const action = isEdit
      ? await dispatch(updateJd({ id: initial.id, payload }))
      : await dispatch(createJd(payload));
    if (action.meta.requestStatus === 'fulfilled') {
      push({ type: 'success', message: isEdit ? 'JD updated' : 'JD created' });
      dispatch(fetchJds({ page: 1, limit: 20 }));
      onClose();
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Job Description' : 'New Job Description'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{isEdit ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <Input name="title" label="Title" value={form.title} onChange={onChange} required />
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Input name="techStack" label="Tech stack" value={form.techStack} onChange={onChange} required placeholder="react, devops, etc." />
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Experience</label>
            <select name="experience" value={form.experience} onChange={onChange} style={{ width: '100%', padding: '8px 10px' }}>
              <option value="entry">Entry</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
          <Input name="minYears" type="number" label="Min years" value={form.minYears} onChange={onChange} />
          <Input name="maxYears" type="number" label="Max years" value={form.maxYears} onChange={onChange} />
          <Input name="location" label="Location" value={form.location} onChange={onChange} />
        </div>
        <Textarea name="jobRole" label="Job Role" rows={3} value={form.jobRole} onChange={onChange} />
        <Textarea name="responsibilities" label="Role + Responsibilities" rows={6} value={form.responsibilities} onChange={onChange} />
        <Textarea name="qualifications" label="Person Specification and Qualifications" rows={6} value={form.qualifications} onChange={onChange} />
        <Textarea name="niceToHave" label="Plus Points (Nice-to-Have)" rows={4} value={form.niceToHave} onChange={onChange} />
      </form>
    </Modal>
  );
}

function Textarea({ name, label, rows, value, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>{label}</label>
      <textarea
        name={name}
        rows={rows}
        value={value}
        onChange={onChange}
        style={{ width: '100%', resize: 'vertical', padding: 8, fontFamily: 'inherit' }}
      />
    </div>
  );
}

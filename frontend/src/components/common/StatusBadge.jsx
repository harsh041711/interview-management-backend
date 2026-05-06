import './StatusBadge.scss';

const VARIANTS = {
  pending: 'pending',
  photo_captured: 'info',
  in_progress: 'info',
  completed: 'success',
  expired: 'warn',
  cheated: 'danger',
  active: 'info',
  submitted: 'success',
  auto_submitted: 'warn',
};

const LABELS = {
  pending: 'Pending',
  photo_captured: 'Photo captured',
  in_progress: 'In progress',
  completed: 'Completed',
  expired: 'Expired',
  cheated: 'Cheated',
  active: 'Active',
  submitted: 'Submitted',
  auto_submitted: 'Auto-submitted',
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  const variant = VARIANTS[status] || 'pending';
  return <span className={`status-badge status-badge--${variant}`}>{LABELS[status] || status}</span>;
}

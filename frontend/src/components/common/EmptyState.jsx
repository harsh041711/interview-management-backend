import './EmptyState.scss';

export default function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">∅</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

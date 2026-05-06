import { useEffect } from 'react';
import './Modal.scss';

export default function Modal({ open, title, children, onClose, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose?.();
    }}>
      <div className={`modal__panel modal__panel--${size}`}>
        {title && (
          <header className="modal__header">
            <h3>{title}</h3>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
          </header>
        )}
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}

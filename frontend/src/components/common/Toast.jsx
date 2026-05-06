import { createContext, useCallback, useContext, useState } from 'react';
import './Toast.scss';

const ToastContext = createContext({ push: () => {}, remove: () => {} });

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ message, type = 'info', duration = 3500 }) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration) setTimeout(() => remove(id), duration);
      return id;
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} onClick={() => remove(t.id)}>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

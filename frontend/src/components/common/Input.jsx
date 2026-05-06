import { forwardRef } from 'react';
import './Input.scss';

const Input = forwardRef(function Input(
  { label, error, hint, className = '', as = 'input', children, ...rest },
  ref,
) {
  const Tag = as;
  return (
    <label className={`field ${error ? 'field--error' : ''} ${className}`}>
      {label && <span className="field__label">{label}</span>}
      <Tag ref={ref} className="field__input" {...rest}>{children}</Tag>
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
});

export default Input;

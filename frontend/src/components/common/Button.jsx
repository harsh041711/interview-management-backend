import './Button.scss';

const variantClass = {
  primary: 'btn btn--primary',
  secondary: 'btn btn--secondary',
  ghost: 'btn btn--ghost',
  danger: 'btn btn--danger',
  success: 'btn btn--success',
};

export default function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={[
        variantClass[variant] || variantClass.primary,
        `btn--${size}`,
        fullWidth ? 'btn--block' : '',
        className,
      ].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" /> : leftIcon}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  );
}

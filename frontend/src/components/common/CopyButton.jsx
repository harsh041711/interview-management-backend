import { useToast } from '@/components/common/Toast';
import { copyToClipboard } from '@/utils/formatters';
import './CopyButton.scss';

/**
 * A small button that copies `text` to the clipboard and shows a success toast.
 *
 * Props:
 *   text     — string to copy
 *   label    — button label
 *   onCopied — optional callback after successful copy
 */
export default function CopyButton({ text, label = 'Copy', onCopied }) {
  const { push } = useToast();

  const handleClick = async () => {
    const ok = await copyToClipboard(text);
    push({ type: ok ? 'success' : 'error', message: ok ? 'Copied!' : 'Failed to copy' });
    if (ok) onCopied?.();
  };

  return (
    <button type="button" className="copy-btn" onClick={handleClick}>
      {label}
    </button>
  );
}

import { useState } from 'react';
import Button from '@/components/common/Button';
import StarRating from '@/components/common/StarRating';

const COMMENTS_MIN = 10;
const COMMENTS_MAX = 2000;

export default function ReviewForm({ initial, onSubmit, busy, submitLabel = 'Submit review' }) {
  const [knowledge, setKnowledge] = useState(initial?.ratings?.knowledge || 0);
  const [communication, setCommunication] = useState(initial?.ratings?.communication || 0);
  const [confidence, setConfidence] = useState(initial?.ratings?.confidence || 0);
  const [comments, setComments] = useState(initial?.comments || '');
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!knowledge || !communication || !confidence) {
      setError('All three star ratings are required.');
      return;
    }
    if (comments.trim().length < COMMENTS_MIN) {
      setError(`Comments must be at least ${COMMENTS_MIN} characters.`);
      return;
    }
    setError(null);
    onSubmit({
      ratings: { knowledge, communication, confidence },
      comments: comments.trim(),
    });
  };

  return (
    <form className="review-form" onSubmit={submit}>
      <StarRating label="Knowledge" value={knowledge} onChange={setKnowledge} />
      <StarRating label="Communication" value={communication} onChange={setCommunication} />
      <StarRating label="Confidence" value={confidence} onChange={setConfidence} />
      <div className="review-form__field">
        <span className="review-form__label">Comments</span>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="What stood out? Strengths, gaps, recommendation..."
          rows={6}
          maxLength={COMMENTS_MAX}
        />
        <span className="review-form__hint">
          {comments.length}/{COMMENTS_MAX} chars (min {COMMENTS_MIN})
        </span>
      </div>
      {error && <div className="review-form__error">{error}</div>}
      <div className="review-form__actions">
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}

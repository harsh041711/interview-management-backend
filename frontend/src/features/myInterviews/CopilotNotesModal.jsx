import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import './CopilotNotesModal.scss';

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function CopilotNotesModal({ open, onClose, session }) {
  if (!session) return null;
  const questions = (session.questions || []).filter((q) => q.askedAt);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Co-pilot interview notes"
      size="lg"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="copilot-notes">
        {questions.length === 0 ? (
          <p className="copilot-notes__empty">No questions were marked as asked during the co-pilot session.</p>
        ) : (
          <>
            <p className="copilot-notes__hint">
              {questions.length} question{questions.length === 1 ? '' : 's'} asked. Use these to inform your final ratings and comments.
            </p>
            <ol className="copilot-notes__list">
              {questions.map((q, i) => (
                <li key={i} className="copilot-notes__item">
                  <div className="copilot-notes__head">
                    <span className={`copilot-notes__diff copilot-notes__diff--${q.difficulty}`}>
                      {DIFFICULTY_LABEL[q.difficulty] || q.difficulty}
                    </span>
                    {q.topic && <span className="copilot-notes__topic">{q.topic}</span>}
                    <span className="copilot-notes__rating">
                      {q.rating != null ? `★ ${q.rating}/5` : 'No rating'}
                    </span>
                  </div>
                  <div className="copilot-notes__text">{q.text}</div>
                  {q.note?.trim() && (
                    <div className="copilot-notes__note">
                      <span className="copilot-notes__note-label">Note</span>
                      <span>{q.note}</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Modal>
  );
}

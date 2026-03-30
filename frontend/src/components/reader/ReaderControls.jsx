import React from 'react';

const ReaderControls = ({
  onPrev,
  onNext,
  canPrev,
  canNext,
  pageIndex,
  totalPages,
}) => {
  const pageLabel = totalPages ? `Page ${pageIndex + 1} of ${totalPages}` : `Page ${pageIndex + 1} of …`;

  return (
    <div className="reader-page-controls" aria-label="Page controls">
      <button type="button" className="page-nav-btn" onClick={onPrev} disabled={!canPrev}>
        ← Previous
      </button>
      <span className="page-indicator" aria-live="polite">{pageLabel}</span>
      <button type="button" className="page-nav-btn" onClick={onNext} disabled={!canNext}>
        Next →
      </button>
    </div>
  );
};

export default ReaderControls;


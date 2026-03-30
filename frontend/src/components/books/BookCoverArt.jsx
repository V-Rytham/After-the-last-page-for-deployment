import React, { useMemo, useState } from 'react';
import { getOpenLibraryCoverCandidates } from '../../utils/openLibraryCovers';

const BookCoverArt = ({
  book,
  alt,
  imgClassName = 'book-cover-image',
  fallbackClassName = 'book-cover-fallback',
  showSpine = true,
  showPattern = false,
  spineClassName = 'book-cover-spine',
  patternClassName = 'book-cover-pattern',
}) => {
  const candidates = useMemo(() => getOpenLibraryCoverCandidates(book), [book]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  const activeSrc = candidates[candidateIndex] || null;

  if (!activeSrc) {
    return (
      <div className={fallbackClassName}>
        {showSpine && <div className={spineClassName} />}
        {showPattern && <div className={patternClassName} />}
      </div>
    );
  }

  return (
    <img
      key={activeSrc}
      src={activeSrc}
      alt={alt || `${book?.title || 'Book'} cover`}
      className={imgClassName}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex((index) => index + 1);
          return;
        }
        setCandidateIndex(candidates.length);
      }}
    />
  );
};

export default BookCoverArt;


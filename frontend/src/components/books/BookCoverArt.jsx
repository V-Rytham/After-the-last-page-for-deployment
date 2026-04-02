import React, { useMemo, useState } from 'react';
import { getBestCoverUrl } from '../../utils/openLibraryCovers';

const BookCoverArt = ({
  book,
  alt,
  imgClassName = 'book-cover-image',
  fallbackClassName = 'book-cover-fallback',
  showSpine = true,
  showPattern = false,
  spineClassName = 'book-cover-spine',
  patternClassName = 'book-cover-pattern',
  disableImage = false,
}) => {
  const coverUrl = useMemo(() => getBestCoverUrl(book), [book]);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [failedUrls, setFailedUrls] = useState(() => new Set());

  const showFallback = disableImage || !coverUrl || failedUrls.has(coverUrl);
  const imgLoaded = coverUrl && loadedUrl === coverUrl;

  return (
    <>
      {!imgLoaded && !showFallback && <div className="book-cover-skeleton" aria-hidden="true" />}
      {!showFallback ? (
        <img
          src={coverUrl}
          alt={alt || `${book?.title || 'Book'} cover`}
          className={imgClassName}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedUrl(coverUrl)}
          onError={() => setFailedUrls((previous) => new Set(previous).add(coverUrl))}
        />
      ) : (
        <div className={fallbackClassName} aria-label={`${book?.title || 'Book'} cover art`}>
          {showSpine && <div className={spineClassName} />}
          {showPattern && <div className={patternClassName} />}
        </div>
      )}
    </>
  );
};

export default BookCoverArt;

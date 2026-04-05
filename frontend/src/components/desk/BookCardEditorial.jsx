import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getBestCoverUrl } from '../../utils/openLibraryCovers';

const clampProgress = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
};

const getReadingState = (session) => {
  const progress = clampProgress(session?.progressPercent);
  if (session?.isFinished || progress >= 100) {
    return { status: 'completed', readingProgress: 100 };
  }
  if (progress > 0) {
    return { status: 'in-progress', readingProgress: Math.round(progress) };
  }
  return { status: 'not-started', readingProgress: 0 };
};

const BookCardEditorial = ({ book, session }) => {
  const coverUrl = getBestCoverUrl(book);
  const route = book?.gutenbergId ? `/read/gutenberg/${book.gutenbergId}` : '/library';
  const title = String(book?.title || 'Untitled').trim() || 'Untitled';
  const author = String(book?.author || 'Unknown author').trim() || 'Unknown author';

  const mappedState = useMemo(() => {
    const { status, readingProgress } = getReadingState(session);
    return {
      title,
      author,
      coverImage: coverUrl || '',
      status,
      readingProgress,
    };
  }, [author, coverUrl, session, title]);

  return (
    <Link to={route} className="editorial-book-card" aria-label={`Open ${mappedState.title}`}>
      <div className="editorial-book-card__cover">
        {mappedState.coverImage ? (
          <img src={mappedState.coverImage} alt={`${mappedState.title} cover`} loading="lazy" decoding="async" />
        ) : (
          <div className="editorial-book-card__fallback" aria-hidden="true">{mappedState.title.slice(0, 1)}</div>
        )}
      </div>
      <h3 title={mappedState.title}>{mappedState.title}</h3>
      <p>{mappedState.author}</p>

      {mappedState.status === 'in-progress' && (
        <div className="editorial-book-card__progress-block">
          <div
            className="editorial-book-card__progress"
            role="progressbar"
            aria-valuenow={mappedState.readingProgress}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Reading progress"
          >
            <div style={{ width: `${mappedState.readingProgress}%` }} />
          </div>
          <span className="editorial-book-card__status">{mappedState.readingProgress}%</span>
        </div>
      )}

      {mappedState.status === 'completed' && (
        <span className="editorial-book-card__status editorial-book-card__status--finished">
          <span aria-hidden="true" className="editorial-book-card__finished-dot" />
          Finished
        </span>
      )}

      {mappedState.status === 'not-started' && (
        <span className="editorial-book-card__status editorial-book-card__status--subtle">Not started</span>
      )}
    </Link>
  );
};

export default memo(BookCardEditorial);

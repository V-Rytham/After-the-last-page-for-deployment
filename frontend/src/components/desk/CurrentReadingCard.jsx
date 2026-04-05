import React from 'react';
import { Link } from 'react-router-dom';
import { getBestCoverUrl } from '../../utils/openLibraryCovers';

const CurrentReadingCard = ({ book, session }) => {
  if (!book) {
    return (
      <article className="current-reading-card current-reading-card--empty">
        <p>No active read yet. Open a book to start tracking your progress.</p>
        <Link to="/library" className="desk-btn desk-btn--secondary">Browse books</Link>
      </article>
    );
  }

  const totalPages = Math.max(0, Number(session?.totalPages || 0));
  const currentPage = Math.max(1, Number(session?.currentPage || 1));
  const sessionProgress = Number(session?.progressPercent || 0);
  const computedProgress = totalPages > 0 ? (currentPage / totalPages) * 100 : sessionProgress;
  const progress = Math.max(0, Math.min(100, Number.isFinite(computedProgress) ? computedProgress : 0));
  const progressRounded = Math.round(progress);
  const route = book?.gutenbergId ? `/read/gutenberg/${book.gutenbergId}` : '/library';
  const coverUrl = getBestCoverUrl(book);

  return (
    <article className="current-reading-card">
      <div className="current-reading-card__left">
        <Link to={route} className="current-reading-card__cover-link" aria-label={`Open ${book?.title || 'book'}`}>
          {coverUrl ? (
            <img src={coverUrl} alt={`${book?.title || 'Book'} cover`} loading="lazy" decoding="async" />
          ) : (
            <div className="current-reading-card__cover-fallback" aria-hidden="true">{(book?.title || '?').slice(0, 1)}</div>
          )}
        </Link>
        <div className="current-reading-card__meta">
          <p className="current-reading-card__eyebrow">CONTINUE READING</p>
          <h3>{book?.title || 'Untitled'}</h3>
          <p>{book?.author || 'Unknown author'}</p>
          <span>Page {currentPage}{totalPages > 0 ? ` of ${totalPages}` : ''} · {progressRounded}% complete</span>
          <div className="reading-progress" role="progressbar" aria-valuenow={progressRounded} aria-valuemin="0" aria-valuemax="100" aria-label="Reading progress">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <Link className="desk-btn" to={route}>Resume reading</Link>
    </article>
  );
};

export default CurrentReadingCard;

import React from 'react';
import { Link } from 'react-router-dom';
import { getBestCoverUrl } from '../../utils/openLibraryCovers';

const CurrentReadingCard = ({ book, session }) => {
  if (!book) {
    return (
      <article className="current-reading-card current-reading-card--empty">
        <p>No active read yet. Open a book to start tracking your progress.</p>
        <Link to="/library" className="desk-btn desk-btn--secondary">Browse Books</Link>
      </article>
    );
  }

  const totalPages = Number(session?.totalPages || 0);
  const currentPage = Number(session?.currentPage || 0);
  const computedProgress = totalPages > 0 ? (currentPage / totalPages) * 100 : Number(session?.progressPercent || 0);
  const progress = Math.max(0, Math.min(100, computedProgress));
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
          <p className="current-reading-card__eyebrow">PICK UP WHERE YOU LEFT OFF</p>
          <h3>{book?.title || 'Untitled'}</h3>
          <p>{book?.author || 'Unknown author'}</p>
          <span>Continue from page {currentPage > 0 ? currentPage : 1}</span>
          <div className="reading-progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <Link className="desk-btn" to={route}>Resume</Link>
    </article>
  );
};

export default CurrentReadingCard;

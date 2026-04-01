import React from 'react';
import { Link } from 'react-router-dom';
import BookCoverArt from './BookCoverArt';
import './BookCard.css';

const OPEN_LIBRARY_COVER_BASE = 'https://covers.openlibrary.org/b/id';

const getCoverId = (book) => {
  const candidates = [book?.coverId, book?.cover_id, book?.cover?.id, book?.metadata?.coverId];
  const match = candidates.find((value) => value !== null && value !== undefined && String(value).trim() !== '');
  return match ? String(match).trim() : null;
};

const BookCard = ({
  book,
  to,
  className = '',
  compact = false,
  actionLabel,
  actionHref,
}) => {
  const coverId = getCoverId(book);
  const artBook = coverId
    ? { ...book, coverImage: `${OPEN_LIBRARY_COVER_BASE}/${encodeURIComponent(coverId)}-L.jpg` }
    : book;

  return (
    <article className={`book-card ${compact ? 'book-card--compact' : ''} ${className}`.trim()}>
      <Link className="book-card__cover-link" to={to} aria-label={`Open ${book?.title || 'book'}`}>
        <div className="book-card__cover-wrap">
          <BookCoverArt
            book={artBook}
            alt={`${book?.title || 'Book'} cover`}
            fallbackClassName="book-card__cover-fallback"
            showPattern
          />
        </div>
      </Link>

      <div className="book-card__info">
        <h3 className="book-card__title">{book?.title || 'Untitled'}</h3>
        <p className="book-card__author">{book?.author || 'Unknown author'}</p>
      </div>

      {actionLabel && actionHref && (
        <Link className="book-card__action" to={actionHref}>
          {actionLabel}
        </Link>
      )}
    </article>
  );
};

export default BookCard;

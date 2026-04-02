import React, { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import BookCoverArt from './BookCoverArt';
import { getBestCoverUrl } from '../../utils/openLibraryCovers';
import './BookCard.css';

const BookCard = ({
  book,
  to,
  className = '',
  compact = false,
  actionLabel,
  actionHref,
}) => {
  const coverUrl = getBestCoverUrl(book);

  const [imgError, setImgError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);

  const shouldShowImage = Boolean(coverUrl) && !imgError;

  return (
    <article className={`book-card ${compact ? 'book-card--compact' : ''} ${className}`.trim()}>
      <div className="card-inner">
        <Link className="book-card__cover-link" to={to} aria-label={`Open ${book?.title || 'book'}`}>
          <div className="book-card__cover-wrap">
            {showSkeleton && (
              <div
                className="book-cover-skeleton"
                aria-hidden="true"
              />
            )}

            {shouldShowImage ? (
              <img
                src={coverUrl}
                alt={`${book?.title || 'Book'} cover`}
                className="book-card__cover-image"
                loading="lazy"
                decoding="async"
                onLoad={() => setShowSkeleton(false)}
                onError={() => {
                  setShowSkeleton(false);
                  setImgError(true);
                }}
              />
            ) : (
              <BookCoverArt
                book={book}
                fallbackClassName="book-card__cover-fallback"
                showPattern
                disableImage
              />
            )}
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
      </div>
    </article>
  );
};

export default memo(BookCard);

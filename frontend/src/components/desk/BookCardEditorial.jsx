import React from 'react';
import { Link } from 'react-router-dom';
import { getBestCoverUrl } from '../../utils/openLibraryCovers';

const BookCardEditorial = ({ book, subtitle, tags = [] }) => {
  const coverUrl = getBestCoverUrl(book);
  const route = book?.gutenbergId ? `/read/gutenberg/${book.gutenbergId}` : '/library';

  return (
    <Link to={route} className="editorial-book-card" aria-label={`Open ${book?.title || 'book'}`}>
      <div className="editorial-book-card__cover">
        {coverUrl ? (
          <img src={coverUrl} alt={`${book?.title || 'Book'} cover`} loading="lazy" decoding="async" />
        ) : (
          <div className="editorial-book-card__fallback" aria-hidden="true">{(book?.title || '?').slice(0, 1)}</div>
        )}
      </div>
      <h3>{book?.title || 'Untitled'}</h3>
      <p>{book?.author || 'Unknown author'}</p>
      {subtitle && <span className="editorial-book-card__status">{subtitle}</span>}
      {tags.length > 0 && (
        <div className="editorial-book-card__chips" aria-label="Book tags">
          {tags.slice(0, 2).map((tag) => <span key={`${book?._id || book?.gutenbergId}-${tag}`}>{tag}</span>)}
        </div>
      )}
    </Link>
  );
};

export default BookCardEditorial;

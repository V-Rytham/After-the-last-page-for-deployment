import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getBestCoverUrl } from '../../utils/openLibraryCovers';

const trimLabel = (value, max = 62) => {
  const raw = String(value || '').trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const inferTag = (book) => {
  const title = String(book?.title || '').toLowerCase();
  if (title.includes('mystery') || title.includes('detective')) return 'Mystery';
  if (title.includes('love') || title.includes('romance')) return 'Romance';
  if (title.includes('adventure')) return 'Adventure';
  if (title.includes('science') || title.includes('time')) return 'Science';
  return null;
};

const BookCard = ({ book, loading = false }) => {
  const coverUrl = useMemo(() => getBestCoverUrl(book), [book]);
  const title = String(book?.title || 'Untitled');
  const author = String(book?.author || 'Unknown author');
  const tags = Array.isArray(book?.tags) ? book.tags.filter(Boolean).slice(0, 2) : [];
  const fallbackTag = inferTag(book);

  if (loading) {
    return (
      <article className="library-book-card is-loading" aria-hidden="true">
        <div className="library-book-cover skeleton" />
        <div className="library-book-line skeleton" />
        <div className="library-book-line library-book-line--short skeleton" />
      </article>
    );
  }

  return (
    <article className="library-book-card">
      <Link to={`/read/gutenberg/${book.gutenbergId}`} className="library-book-cover-link" aria-label={`Read ${title}`}>
        <div className="library-book-cover">
          {coverUrl ? (
            <img src={coverUrl} alt={`${title} cover`} loading="lazy" decoding="async" />
          ) : (
            <div className="library-book-cover-fallback" aria-hidden="true">
              <span>{String(title || 'B').charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>
      </Link>

      <h3 className="library-book-title" title={title}>{trimLabel(title)}</h3>
      <p className="library-book-author">{author}</p>

      <div className="library-book-tags" aria-label="Book categories">
        {tags.length > 0 ? tags.map((tag) => <span key={`${book.gutenbergId}-${tag}`}>{tag}</span>) : fallbackTag ? <span>{fallbackTag}</span> : null}
      </div>

      <Link to={`/read/gutenberg/${book.gutenbergId}`} className="library-book-cta">Read this book</Link>
    </article>
  );
};

export default BookCard;

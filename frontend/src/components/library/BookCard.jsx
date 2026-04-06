import React, { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGutenbergCoverUrl, PLACEHOLDER_COVER } from '../../utils/libraryApi';

const sanitizeGenres = (book) => {
  const values = [
    ...(Array.isArray(book?.genres) ? book.genres : []),
    ...(Array.isArray(book?.genre) ? book.genre : []),
    ...(typeof book?.genre === 'string' ? [book.genre] : []),
    ...(Array.isArray(book?.tags) ? book.tags : []),
  ]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return Array.from(new Set(values)).slice(0, 6);
};

const BookCard = ({ book, loading = false }) => {
  const [imageError, setImageError] = useState(false);

  if (loading) {
    return (
      <article className="library-book-card" aria-hidden="true">
        <div className="library-book-cover skeleton" />
        <div className="library-book-title skeleton" />
        <div className="library-book-author skeleton" />
        <div className="library-book-tags-skeleton">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
        <div className="library-book-cta skeleton" />
      </article>
    );
  }

  const source = String(book?.source || (book?.gutenbergId ? 'gutenberg' : 'gutenberg')).toLowerCase();
  const sourceId = String(book?.sourceId || book?.gutenbergId || book?.id || '');
  const id = book?.id || `${source}:${sourceId}`;
  const title = String(book?.title || 'Untitled');
  const author = String(book?.author || 'Unknown author');
  const genres = sanitizeGenres(book);
  const coverSrc = imageError
    ? PLACEHOLDER_COVER
    : (book?.cover_url || book?.coverImage || (source === 'gutenberg' ? getGutenbergCoverUrl(sourceId) : PLACEHOLDER_COVER));
  const readPath = source === 'gutenberg'
    ? `/read/gutenberg/${sourceId}`
    : `/read/${encodeURIComponent(id)}`;

  return (
    <article className="library-book-card">
      <Link className="library-cover-link" to={readPath} aria-label={`Read ${title}`}>
        <div className="library-book-cover">
          <img src={coverSrc} alt={`${title} cover`} loading="lazy" decoding="async" onError={() => setImageError(true)} />
        </div>
      </Link>
      <h3 className="library-book-title" title={title}>{title}</h3>
      <p className="library-book-author">{author}</p>
      <div className="library-book-genres" aria-label="Book genres">
        {genres.length > 0
          ? genres.map((genre) => <span key={`${id}-${genre}`} className="library-book-genre-pill">{genre}</span>)
          : <span className="library-book-genre-pill">Unknown</span>}
      </div>
      <Link className="library-book-cta" to={readPath}>Read</Link>
    </article>
  );
};

export default memo(BookCard);

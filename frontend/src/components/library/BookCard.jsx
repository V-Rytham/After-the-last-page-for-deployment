import React, { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGutenbergCoverUrl, PLACEHOLDER_COVER } from '../../utils/libraryApi';

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
  const genreText = book?.genres?.length ? book.genres.join(', ') : 'Unknown';
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
      <p className="library-book-genre" aria-label="Book genres">{genreText}</p>
      <Link className="library-book-cta" to={readPath}>Read</Link>
    </article>
  );
};

export default memo(BookCard);

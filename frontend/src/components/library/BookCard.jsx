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

  const id = book?.id || book?.gutenbergId;
  const title = String(book?.title || 'Untitled');
  const author = String(book?.author || 'Unknown author');
  const tags = Array.isArray(book?.tags) ? book.tags.filter(Boolean) : [];
  const visibleTags = tags.slice(0, 2);
  if (tags.length > 2) visibleTags.push(`+${tags.length - 2}`);
  const coverSrc = imageError ? PLACEHOLDER_COVER : (book?.cover_url || book?.coverImage || getGutenbergCoverUrl(id));

  return (
    <article className="library-book-card">
      <Link className="library-cover-link" to={`/read/gutenberg/${id}`} aria-label={`Read ${title}`}>
        <div className="library-book-cover">
          <img src={coverSrc} alt={`${title} cover`} loading="lazy" decoding="async" onError={() => setImageError(true)} />
        </div>
      </Link>
      <h3 className="library-book-title" title={title}>{title}</h3>
      <p className="library-book-author">{author}</p>
      <div className="library-book-tags" aria-label="Book tags">
        {visibleTags.map((tag) => <span key={`${id}-${tag}`}>{tag}</span>)}
      </div>
      <Link className="library-book-cta" to={`/read/gutenberg/${id}`}>Read</Link>
    </article>
  );
};

export default memo(BookCard);

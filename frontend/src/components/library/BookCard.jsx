import React, { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGutenbergCoverUrl, PLACEHOLDER_COVER } from '../../utils/libraryApi';

const inferTag = (book) => {
  const title = String(book?.title || '').toLowerCase();
  if (title.includes('wonderland') || title.includes('fantasy')) return 'Fantasy';
  if (title.includes('hamlet') || title.includes('romeo') || title.includes('drama')) return 'Drama';
  if (title.includes('prejudice') || title.includes('classic')) return 'Classic Literature';
  return '';
};

const BookCard = ({ book, loading = false }) => {
  const [imageError, setImageError] = useState(false);

  if (loading) {
    return (
      <article className="library-book-card" aria-hidden="true">
        <div className="library-book-cover skeleton" />
        <div className="library-book-title skeleton" />
        <div className="library-book-author skeleton" />
      </article>
    );
  }

  const title = String(book?.title || 'Untitled');
  const author = String(book?.author || 'Unknown author');
  const tags = Array.isArray(book?.tags) && book.tags.length > 0 ? book.tags.slice(0, 2) : (inferTag(book) ? [inferTag(book)] : []);
  const coverSrc = imageError ? PLACEHOLDER_COVER : (book?.coverImage || getGutenbergCoverUrl(book?.gutenbergId));

  return (
    <article className="library-book-card">
      <Link className="library-cover-link" to={`/read/gutenberg/${book.gutenbergId}`} aria-label={`Read ${title}`}>
        <div className="library-book-cover">
          <img
            src={coverSrc}
            alt={`${title} cover`}
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
          />
        </div>
      </Link>

      <h3 className="library-book-title" title={title}>{title}</h3>
      <p className="library-book-author">{author}</p>

      <div className="library-book-tags" aria-label="Book tags">
        {tags.map((tag) => <span key={`${book.gutenbergId}-${tag}`}>{tag}</span>)}
      </div>

      <Link className="library-book-cta" to={`/read/gutenberg/${book.gutenbergId}`}>Read this book</Link>
    </article>
  );
};

export default memo(BookCard);

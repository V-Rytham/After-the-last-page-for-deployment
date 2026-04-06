import React, { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserShelf, toggleBookOnShelf } from '../../utils/readingSession';
import { getStep, setHighlightBookId } from '../../onboardingManager';

const PLACEHOLDER_COVER = 'https://placehold.co/420x630?text=No+Cover';

const getGutenbergCoverUrl = (gutenbergId) => {
  const id = String(gutenbergId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  return `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;
};

const normalizeGenre = (value) => String(value || '').trim();

const BookCard = ({ book, loading = false, onboardingHighlight = false }) => {
  const [imageError, setImageError] = useState(false);

  const shelfKey = useMemo(() => {
    if (!book) return '';
    const source = String(book?.source || (book?.gutenbergId ? 'gutenberg' : '')).trim().toLowerCase();
    const sourceId = String(book?.sourceId || book?.gutenbergId || '').trim();
    return source && sourceId ? `${source}:${sourceId}` : '';
  }, [book]);

  const [isSaved, setIsSaved] = useState(() => (shelfKey ? getUserShelf().includes(shelfKey) : false));

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

  const title = String(book?.title || '').trim();
  const author = String(book?.author || '').trim();
  const genres = Array.isArray(book?.genres) ? book.genres.map(normalizeGenre).filter(Boolean).slice(0, 6) : [];
  if (!title || !author || genres.length === 0) {
    return null;
  }

  const gutenbergId = book?.gutenbergId != null ? Number(book.gutenbergId) : null;
  const source = String(book?.source || (Number.isFinite(gutenbergId) ? 'gutenberg' : '')).trim().toLowerCase();
  const sourceId = String(book?.sourceId || (Number.isFinite(gutenbergId) ? gutenbergId : '') || '').trim();
  const compositeId = source && sourceId ? `${source}:${sourceId}` : '';

  const coverSrc = imageError
    ? PLACEHOLDER_COVER
    : (String(book?.coverImage || '').trim() || (source === 'gutenberg' ? (getGutenbergCoverUrl(sourceId) || PLACEHOLDER_COVER) : PLACEHOLDER_COVER));

  const readPath = source === 'gutenberg' && Number.isFinite(Number(sourceId))
    ? `/read/gutenberg/${encodeURIComponent(sourceId)}`
    : `/read/${encodeURIComponent(compositeId)}`;

  const resolvedShelfKey = shelfKey || compositeId;

  return (
    <article
      className={`library-book-card${onboardingHighlight ? ' is-onboarding-highlight onboarding-target-glow' : ''}`}
      data-onboarding={onboardingHighlight ? 'added-book-card' : undefined}
      data-onboarding-book-id={resolvedShelfKey}
    >
      <Link className="library-cover-link" to={readPath} aria-label={`Read ${title}`}>
        <div className="library-book-cover">
          <img src={coverSrc} alt={`${title} cover`} loading="lazy" decoding="async" onError={() => setImageError(true)} />
        </div>
      </Link>
      <h3 className="library-book-title" title={title}>{title}</h3>
      <p className="library-book-author">{author}</p>
      <div className="library-book-genres" aria-label="Book genres">
        {genres.map((genre) => <span key={`${resolvedShelfKey}-${genre}`} className="library-book-genre-pill">{genre}</span>)}
      </div>

      <div className="library-book-actions">
        <Link className="library-book-cta" to={readPath}>Read</Link>
        <button
          type="button"
          className={`library-book-save${isSaved ? ' is-saved' : ''}`}
          aria-label={isSaved ? `Remove ${title} from your shelf` : `Add ${title} to your shelf`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const wasSaved = isSaved;
            const nextShelf = toggleBookOnShelf(resolvedShelfKey);
            const nextSaved = nextShelf.includes(resolvedShelfKey);
            setIsSaved(nextSaved);

            if (!wasSaved && nextSaved && Number(getStep()) === 2) {
              setHighlightBookId(resolvedShelfKey);
            }
          }}
        >
          {isSaved ? 'Saved' : 'Add'}
        </button>
      </div>
    </article>
  );
};

export default memo(BookCard);

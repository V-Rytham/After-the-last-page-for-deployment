import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, Clock3, Search, Bookmark, BookmarkCheck } from 'lucide-react';
import api from '../utils/api';
import { getFallbackBooks } from '../utils/bookFallback';
import { getLibraryState, toggleBookOnShelf, getUserShelf } from '../utils/readingSession';
import BookCoverArt from '../components/books/BookCoverArt';
import './BooksLibrary.css';

const getBookId = (book) => book._id || book.id;

const isFinished = (book) => Boolean(book?.session?.isFinished || book?.session?.progressPercent >= 100);

const useFitOneLineText = ({ text, minPx = 12 } = {}) => {
  const ref = React.useRef(null);
  const basePxRef = React.useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return undefined;
    }

    const fit = () => {
      const node = ref.current;
      if (!node) return;

      node.style.fontSize = '';
      const computed = window.getComputedStyle(node);
      const basePx = basePxRef.current ?? (Number.parseFloat(computed.fontSize) || null);
      if (!basePx) return;
      basePxRef.current = basePx;

      // Force layout to measure overflow.
      const available = node.clientWidth;
      const required = node.scrollWidth;
      if (!available || !required || required <= available) {
        return;
      }

      const ratio = available / required;
      const nextPx = Math.max(minPx, Math.floor(basePx * ratio * 100) / 100);
      node.style.fontSize = `${nextPx}px`;
    };

    const raf = window.requestAnimationFrame(fit);

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(fit);
    });
    observer.observe(el);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [minPx, text]);

  return ref;
};

const getProgressLabel = (book) => {
  if (book.session?.progressPercent > 0 && book.session?.progressPercent < 100) {
    return `Continue from page ${book.session.currentPage}`;
  }

  if (isFinished(book)) {
    return 'Finished';
  }

  return `${book.minReadHours || 2}h reading time`;
};

const renderCoverArt = (book) => {
  return (
    <BookCoverArt
      book={book}
      imgClassName="book-cover-image"
      fallbackClassName="book-cover-fallback"
      showSpine
      showPattern
      spineClassName="book-cover-spine"
      patternClassName="book-cover-pattern"
    />
  );
};

const FeaturedContinue = ({ book }) => {
  const titleRef = useFitOneLineText({ text: book?.title || '', minPx: 16 });

  if (!book) {
    return (
      <div className="section-empty">
        <BookOpen size={18} />
        <p>No book is open yet. Start from your library.</p>
      </div>
    );
  }

  const bookId = getBookId(book);
  const progressPercent = book.session?.progressPercent || 0;

  return (
    <article className="featured-continue-card">
      <Link to={`/read/${bookId}`} className="featured-continue-cover" aria-label={`Open ${book.title}`}>
        <div className="featured-continue-cover-art" style={{ '--book-accent': book.coverColor || '#6f614d' }}>
          {renderCoverArt(book)}
        </div>
      </Link>

      <div className="featured-continue-copy">
        <span className="featured-continue-kicker">Pick up where you left off</span>
        <h3 ref={titleRef} className="featured-continue-title font-serif" title={book.title}>{book.title}</h3>
        <p className="featured-continue-author">{book.author}</p>
        <p className="featured-continue-progress">{getProgressLabel(book)}</p>
        {progressPercent > 0 && progressPercent < 100 && (
          <div className="featured-continue-meter" aria-label={`Reading progress ${progressPercent}%`}>
            <div className="featured-continue-meter-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>

      <div className="featured-continue-action">
        <Link to={`/read/${bookId}`} className="btn-resume">
          Resume
        </Link>
      </div>
    </article>
  );
};

const BookEntry = ({ book, compact = false, onToggleShelf, isSaved }) => {
  const bookId = getBookId(book);
  const progressPercent = book.session?.progressPercent || 0;
  const displayTitle = (book.title || '').split(';')[0].trim();
  const finished = isFinished(book);
  const titleRef = useFitOneLineText({ text: displayTitle, minPx: compact ? 12 : 13 });

  const handleToggleShelf = (e) => {
    e.preventDefault();
    if (onToggleShelf) {
      onToggleShelf(bookId);
    }
  };

  return (
    <Link to={`/read/${bookId}`} className={`book-entry ${compact ? 'compact' : ''}`}>
      <article className="book-object">
        <div className="book-cover-wrap" style={{ '--book-accent': book.coverColor || '#6f614d' }}>
          {renderCoverArt(book)}

          {onToggleShelf && (
            <button
              className={`book-shelf-toggle ${isSaved ? 'saved' : ''}`}
              onClick={handleToggleShelf}
              aria-label={isSaved ? "Remove from shelf" : "Add to shelf"}
            >
              {isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            </button>
          )}
        </div>

        {progressPercent > 0 && (
          <div className="book-progress">
            <div className="book-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        )}

        <div className="book-copy">
          <h3 ref={titleRef} className="book-title font-serif" title={book.title}>{displayTitle}</h3>
          <p className="book-author">{book.author}</p>
          <div className="book-meta">
            <span>{getProgressLabel(book)}</span>
            {!finished && !book.session?.progressPercent && (
              <>
                <span className="meta-separator">/</span>
                <span>{(book.tags || []).slice(0, 1)[0] || 'Book'}</span>
              </>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
};

const Section = ({ title, subtitle, books, compact = false, onToggleShelf, userShelfIds }) => {
  if (!books.length) {
    return null;
  }

  return (
    <section className="library-section">
      <div className="section-heading">
        <h2 className="font-serif">{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <div className={`books-shelf ${compact ? 'compact' : ''}`}>
        {books.map((book) => (
          <BookEntry 
            key={getBookId(book)} 
            book={book} 
            compact={compact} 
            onToggleShelf={onToggleShelf}
            isSaved={userShelfIds ? userShelfIds.has(getBookId(book)) : false}
          />
        ))}
      </div>
    </section>
  );
};

const BooksLibrary = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [tagPage, setTagPage] = useState(0);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recommendationState, setRecommendationState] = useState({ loading: false, currentBookId: null, recommendations: null });
  const [userShelfIds, setUserShelfIds] = useState(new Set(getUserShelf()));

  const handleToggleShelf = (bookId) => {
    const newShelf = toggleBookOnShelf(bookId);
    setUserShelfIds(new Set(newShelf));
  };

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const { data } = await api.get('/books');
        setBooks(data);
      } catch (error) {
        console.error('Failed to fetch books, using local fallback:', error);
        setBooks(getFallbackBooks());
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  const allTags = useMemo(
    () => ['All', 'Fiction', 'Philosophy', 'Adventure', 'Sci-Fi', 'Classic', 'Fantasy', 'Dystopian'],
    [],
  );

  const TAGS_PER_PAGE = 5;
  const maxTagPage = Math.max(0, Math.ceil(allTags.length / TAGS_PER_PAGE) - 1);

  useEffect(() => {
    const selectedIndex = allTags.indexOf(selectedTag);
    if (selectedIndex < 0) {
      return;
    }

    const desiredPage = Math.floor(selectedIndex / TAGS_PER_PAGE);
    setTagPage((prev) => (prev === desiredPage ? prev : desiredPage));
  }, [allTags, selectedTag]);

  const visibleTags = useMemo(() => {
    const start = tagPage * TAGS_PER_PAGE;
    return allTags.slice(start, start + TAGS_PER_PAGE);
  }, [allTags, tagPage]);

  const libraryState = useMemo(() => {
    const state = getLibraryState(books);
    
    // Explicitly update savedBooks based on current userShelfIds state so it's perfectly in sync with immediate UI updates
    state.savedBooks = books
      .filter((book) => userShelfIds.has(getBookId(book)))
      .map((book) => ({
        ...book,
        session: state.sessions[getBookId(book)] || null,
      }));
      
    return state;
  }, [books, userShelfIds]);

  useEffect(() => {
    if (loading || !books.length) {
      return;
    }

    const baseBook = libraryState.continueReading[0] || libraryState.recentlyOpened[0] || null;
    const currentBookId = baseBook ? getBookId(baseBook) : null;
    if (!currentBookId) {
      setRecommendationState({ loading: false, currentBookId: null, recommendations: null });
      return;
    }

    const readBookIds = Object.entries(libraryState.sessions || {})
      .filter(([, session]) => Boolean(session?.isFinished || session?.progressPercent >= 100))
      .map(([bookId]) => bookId);

    let cancelled = false;
    setRecommendationState((prev) => ({ ...prev, loading: true }));

    api.post('/recommender', { currentBookId, readBookIds, limitPerShelf: 8 })
      .then(({ data }) => {
        if (cancelled) {
          return;
        }
        setRecommendationState({
          loading: false,
          currentBookId: data?.currentBookId || currentBookId,
          recommendations: data?.recommendations || null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('[RECOMMENDER] Failed to fetch recommendations:', error);
        setRecommendationState({ loading: false, currentBookId, recommendations: null });
      });

    return () => {
      cancelled = true;
    };
  }, [books, libraryState, loading]);

  const recommendationShelves = useMemo(() => {
    const recs = recommendationState.recommendations;
    if (!recs) {
      return null;
    }

    const byId = new Map(books.map((book) => [getBookId(book), book]));
    
    const seenTitles = new Set();
      const hydrateAndDeduplicate = (bookId) => {
        const book = byId.get(bookId);
        if (!book) {
          return null;
        }
      
      const normalizedTitle = (book.title || '').trim().toLowerCase();
      if (seenTitles.has(normalizedTitle)) return null;
      seenTitles.add(normalizedTitle);

      return {
        ...book,
        session: libraryState.sessions[bookId] || null,
      };
    };

    return {
      basedOnBook: (recs.based_on_book || []).map(hydrateAndDeduplicate).filter(Boolean).slice(0, 6),
      sameAuthor: (recs.same_author || []).map(hydrateAndDeduplicate).filter(Boolean).slice(0, 6),
      seriesContinuation: (recs.series_continuation || []).map(hydrateAndDeduplicate).filter(Boolean).slice(0, 6),
      genreBased: (recs.genre_based || []).map(hydrateAndDeduplicate).filter(Boolean).slice(0, 6),
    };
  }, [books, libraryState.sessions, recommendationState.recommendations]);

  const filteredBooks = useMemo(() => (
    books
      .map((book) => ({
        ...book,
        session: libraryState.sessions[getBookId(book)] || null,
      }))
      .filter((book) => {
        const matchesSearch = !searchTerm.trim() || `${book.title} ${book.author}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTag = selectedTag === 'All' || (book.tags || []).includes(selectedTag);
        return matchesSearch && matchesTag;
      })
  ), [books, libraryState.sessions, searchTerm, selectedTag]);

  const recentActivity = useMemo(() => {
    const continueIds = new Set((libraryState.continueReading || []).map((book) => getBookId(book)));
    const byId = new Map();

    const consider = (book, activityAt) => {
      const id = getBookId(book);
      if (!id || continueIds.has(id)) {
        return;
      }

      const existing = byId.get(id);
      if (!existing || activityAt > existing.activityAt) {
        byId.set(id, { book, activityAt });
      }
    };

    for (const book of libraryState.recentlyOpened || []) {
      const activityAt = new Date(book.session?.lastOpenedAt || 0).getTime();
      consider(book, activityAt);
    }

    return [...byId.values()]
      .sort((a, b) => b.activityAt - a.activityAt)
      .map((entry) => entry.book);
  }, [libraryState.continueReading, libraryState.recentlyOpened]);

  const hasActiveFiltering = Boolean(searchTerm.trim()) || selectedTag !== 'All';
  const shelfCount = libraryState?.savedBooks?.length || 0;
  const hasShelf = shelfCount > 0;
  const hasRecentActivity = recentActivity.length > 0;
  const continueBook = libraryState.continueReading[0] || libraryState.recentlyOpened[0] || null;

  if (loading) {
    return (
      <div className="library-page">
        <div className="content-container library-shell">
          <div className="library-hero">
            <h1 className="library-title animate-fade-in" style={{ textAlign: 'center', maxWidth: 'none' }}>Loading library...</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="library-page animate-fade-in">
      <header className="library-hero">
        <div className="library-controls">
          <label className="search-bar">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="Search your shelf"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="search-input"
            />
          </label>

          <div className="filter-carousel" aria-label="Categories">
            <button
              type="button"
              className="carousel-btn"
              onClick={() => setTagPage((page) => Math.max(0, page - 1))}
              disabled={tagPage === 0}
              aria-label="Show previous categories"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="filter-tags" role="list">
              {visibleTags.map((tag) => (
                <button
                  key={tag}
                  className={`tag-btn ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => setSelectedTag(tag)}
                  type="button"
                >
                  {tag}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="carousel-btn"
              onClick={() => setTagPage((page) => Math.min(maxTagPage, page + 1))}
              disabled={tagPage === maxTagPage}
              aria-label="Show more categories"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <Link to="/request-book" className="request-book-cta">
            Didn&apos;t find your book? Request via Gutenberg ID.
          </Link>
        </div>
      </header>

      {hasActiveFiltering ? (
        <section className="library-section">
          <div className="section-heading">
            <h2 className="font-serif">Filtered shelf</h2>
            <p>{filteredBooks.length} books match your current search.</p>
          </div>

          {filteredBooks.length > 0 ? (
            <div className="books-grid">
              {filteredBooks.map((book) => (
                <BookEntry 
                  key={getBookId(book)} 
                  book={book} 
                  onToggleShelf={handleToggleShelf}
                  isSaved={userShelfIds.has(getBookId(book))}
                />
              ))}
            </div>
          ) : (
            <div className="no-results">
              <BookOpen size={40} className="text-muted" />
              <h3 className="font-serif">No books found on this shelf.</h3>
              <p>Try a different title, author, or category.</p>
              <button className="btn-secondary" type="button" onClick={() => { setSearchTerm(''); setSelectedTag('All'); }}>
                Clear search
              </button>
              <Link to="/request-book" className="btn-secondary request-book-inline-link">
                Request a Gutenberg book
              </Link>
            </div>
          )}
        </section>
      ) : (
        <>
          {(() => {
            const sections = {
              recommendations: recommendationShelves ? (() => {
                const baseBook = books.find((book) => getBookId(book) === recommendationState.currentBookId) || null;
                const baseTitle = baseBook?.title || 'a book you opened';
                const baseAuthor = baseBook?.author || 'this author';
                return (
                  <>
                    <Section
                      title="Continue Series"
                      subtitle="The next unread volume in your current saga."
                      books={recommendationShelves.seriesContinuation}
                      compact
                      onToggleShelf={handleToggleShelf}
                      userShelfIds={userShelfIds}
                    />
                    <Section
                      title={`Because you read ${baseTitle}`}
                      subtitle="Stories with similar tags and themes."
                      books={recommendationShelves.basedOnBook}
                      compact
                      onToggleShelf={handleToggleShelf}
                      userShelfIds={userShelfIds}
                    />
                    <Section
                      title={`More from ${baseAuthor}`}
                      subtitle="Same author, different doors."
                      books={recommendationShelves.sameAuthor}
                      compact
                      onToggleShelf={handleToggleShelf}
                      userShelfIds={userShelfIds}
                    />
                    <Section
                      title="More in this genre"
                      subtitle="A softer fallback when tag matches are thin."
                      books={recommendationShelves.genreBased}
                      compact
                      onToggleShelf={handleToggleShelf}
                      userShelfIds={userShelfIds}
                    />
                  </>
                );
              })() : null,

              activity: (continueBook || hasRecentActivity) ? (
                <>
                  {continueBook ? (
                    <section className="library-section">
                      <div className="section-heading">
                        <h2 className="font-serif">Continue Reading</h2>
                      </div>
                      <FeaturedContinue book={continueBook} />
                    </section>
                  ) : null}

                  {hasRecentActivity ? (
                    <Section
                      title="Recent Activity"
                      subtitle="The last covers you touched, finished, or returned to."
                      books={recentActivity.slice(0, 8)}
                      compact
                      onToggleShelf={handleToggleShelf}
                      userShelfIds={userShelfIds}
                    />
                  ) : null}
                </>
              ) : null,

              shelf: (
                <section className="library-section">
                  <div className="section-heading">
                    <h2 className="font-serif">Your Shelf</h2>
                    <p>Your books, arranged as a calm cover grid.</p>
                  </div>

                  {hasShelf ? (
                    <div className="books-shelf">
                      {libraryState.savedBooks.map((book) => (
                        <BookEntry
                          key={getBookId(book)}
                          book={book}
                          onToggleShelf={handleToggleShelf}
                          isSaved={userShelfIds.has(getBookId(book))}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="no-results shelf-empty">
                      <BookOpen size={32} className="text-muted" />
                      <h3 className="font-serif">Your shelf is empty.</h3>
                      <p>Start adding books you love.</p>
                    </div>
                  )}
                </section>
              ),
            };

            const orderedKeys = ['activity', 'shelf', 'recommendations'];

            return orderedKeys.map((key) => (
              <React.Fragment key={key}>{sections[key] || null}</React.Fragment>
            ));
          })()}
        </>
      )}
    </div>
  );
};

export default BooksLibrary;

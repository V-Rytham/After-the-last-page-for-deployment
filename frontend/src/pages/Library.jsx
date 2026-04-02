import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BookCard from '../components/books/BookCard';
import api from '../utils/api';
import './Library.css';

const INITIAL_BOOKS = 12;
const BOOKS_PAGE_SIZE = 24;

const LibraryPage = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [gutenbergId, setGutenbergId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [previewBook, setPreviewBook] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_BOOKS);
  const loadingMoreRef = useRef(false);
  const searchInputRef = useRef(null);
  const resultsSectionRef = useRef(null);
  const resultRefs = useRef([]);
  const [focusedResultIndex, setFocusedResultIndex] = useState(-1);

  useEffect(() => {
    let active = true;

    const loadBooks = async () => {
      try {
        const { data } = await api.get('/books');
        if (!active) return;
        const nextBooks = Array.isArray(data) ? data : [];
        setBooks(nextBooks);
      } catch (error) {
        console.error('[LIBRARY] Failed to load books:', error);
        if (!active) return;
        setBooks([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBooks();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput.trim().toLowerCase());
    }, 200);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const { filteredBooks, visibleBooks } = useMemo(() => {
    const nextFilteredBooks = !query
      ? books
      : books.filter((book) => {
        const title = String(book?.title || '').toLowerCase();
        const author = String(book?.author || '').toLowerCase();
        return title.includes(query) || author.includes(query);
      });

    return {
      filteredBooks: nextFilteredBooks,
      visibleBooks: nextFilteredBooks.slice(0, visibleCount),
    };
  }, [books, query, visibleCount]);

  useEffect(() => {
    setVisibleCount(INITIAL_BOOKS);
  }, [query, books.length]);

  useEffect(() => {
    resultRefs.current = resultRefs.current.slice(0, visibleBooks.length);
    if (focusedResultIndex >= visibleBooks.length) {
      setFocusedResultIndex(visibleBooks.length > 0 ? visibleBooks.length - 1 : -1);
    }
  }, [focusedResultIndex, visibleBooks.length]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setVisibleCount((current) => {
      if (current >= filteredBooks.length) return current;
      return Math.min(current + BOOKS_PAGE_SIZE, filteredBooks.length);
    });

    requestAnimationFrame(() => {
      loadingMoreRef.current = false;
    });
  }, [filteredBooks.length]);

  useEffect(() => {
    const handleScroll = () => {
      if (visibleCount >= filteredBooks.length) return;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 500;
      if (nearBottom) loadMore();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filteredBooks.length, loadMore, visibleCount]);

  const handlePreviewSubmit = async (event) => {
    event.preventDefault();
    const id = String(gutenbergId || '').trim();
    if (!/^\d+$/.test(id)) return;

    setPreviewLoading(true);
    setPreviewError('');

    try {
      const { data } = await api.get(`/books/gutenberg/${encodeURIComponent(id)}/preview`);
      setPreviewBook({
        gutenbergId: Number(data?.gutenbergId) || Number(id),
        title: data?.title || 'Untitled',
        author: data?.author || 'Unknown author',
      });
    } catch (error) {
      setPreviewBook(null);
      setPreviewError(error?.uiMessage || 'Could not preview this Gutenberg book.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const focusResult = useCallback((index) => {
    if (index < 0 || index >= visibleBooks.length) return;
    const nextNode = resultRefs.current[index];
    if (!nextNode) return;
    setFocusedResultIndex(index);
    nextNode.focus();
    nextNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [visibleBooks.length]);

  const handleSearchKeyDown = useCallback((event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (visibleBooks.length > 0) focusResult(0);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (visibleBooks.length > 0) focusResult(Math.max(visibleBooks.length - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (visibleBooks.length > 0) {
        focusResult(0);
      } else {
        resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [focusResult, visibleBooks.length]);

  const handleResultKeyDown = useCallback((event, index, href) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusResult(Math.min(index + 1, visibleBooks.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) {
        searchInputRef.current?.focus();
      } else {
        focusResult(index - 1);
      }
      return;
    }

    if (event.key === 'Enter' && href) {
      event.preventDefault();
      navigate(href);
    }
  }, [focusResult, navigate, visibleBooks.length]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setFocusedResultIndex(-1);
    setVisibleCount(INITIAL_BOOKS);
    searchInputRef.current?.focus();
  }, []);

  const normalizedGutenbergId = String(gutenbergId || '').trim();
  const validGutenbergInput = /^\d+$/.test(normalizedGutenbergId);

  return (
    <div className="library-page">
      <div className="content-container library-shell">
        <header className="library-header">
          <div className="library-info">
            <h1 className="library-title">Library</h1>
            <p className="library-subtitle">
              Pick up where you left off and preview any Gutenberg ID before opening it.
            </p>
          </div>
          <form className="library-actions" onSubmit={handlePreviewSubmit}>
            <input
              id="library-search"
              ref={searchInputRef}
              className="search-input"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search title or author"
              aria-label="Search books in your library"
            />
            {searchInput.trim() ? (
              <button type="button" className="search-clear-button" onClick={handleClearSearch} aria-label="Clear search">
                Clear
              </button>
            ) : null}
            <input
              id="gutenberg-id"
              className="gutenberg-input"
              value={gutenbergId}
              onChange={(event) => setGutenbergId(event.target.value)}
              placeholder="Gutenberg ID (e.g. 1342)"
              inputMode="numeric"
              aria-label="Enter Gutenberg ID"
            />
            <button type="submit" className="gutenberg-button" disabled={previewLoading || !validGutenbergInput}>
              {previewLoading ? 'Previewing…' : 'Preview Book'}
            </button>
          </form>
        </header>

        {previewError && <p className="library-inline-error">{previewError}</p>}

        {loading ? (
          <div className="loading">Loading books…</div>
        ) : filteredBooks.length === 0 && !previewBook ? (
          <div className="no-results">
            <BookOpen size={28} />
            <p>No books match your search.</p>
          </div>
        ) : (
          <>
            <section className="books-grid" aria-label="Library books" ref={resultsSectionRef}>
              {previewBook && (
                <BookCard
                  key={`preview-${previewBook.gutenbergId}`}
                  book={previewBook}
                  to={`/read/gutenberg/${previewBook.gutenbergId}`}
                  actionLabel="Read Book"
                  actionHref={`/read/gutenberg/${previewBook.gutenbergId}`}
                  className="library-preview-card"
                />
              )}
              {visibleBooks.map((book, index) => (
                <BookCard
                  key={book.gutenbergId || book._id}
                  book={book}
                  to={`/read/gutenberg/${book.gutenbergId}`}
                  actionLabel="Read"
                  actionHref={`/read/gutenberg/${book.gutenbergId}`}
                  cardRef={(node) => {
                    resultRefs.current[index] = node;
                  }}
                  tabIndex={0}
                  onCardFocus={() => setFocusedResultIndex(index)}
                  onCardKeyDown={(event) => handleResultKeyDown(event, index, `/read/gutenberg/${book.gutenbergId}`)}
                  className={focusedResultIndex === index ? 'book-card--focused' : ''}
                />
              ))}
            </section>
            {visibleCount < filteredBooks.length && (
              <p className="library-load-note">Loading more books as you scroll…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LibraryPage;

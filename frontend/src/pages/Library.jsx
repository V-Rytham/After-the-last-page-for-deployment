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
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_BOOKS);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let active = true;

    const loadBooks = async () => {
      try {
        const { data } = await api.get('/books');
        if (!active) return;
        const nextBooks = Array.isArray(data) ? data : [];
        setBooks(nextBooks);
        console.log('Books loaded:', nextBooks.length);
      } catch (error) {
        console.error('[LIBRARY] Failed to load books:', error);
        if (!active) return;
        setBooks([]);
        console.log('Books loaded:', 0);
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

  const handleSubmit = (event) => {
    event.preventDefault();
    const id = String(gutenbergId || '').trim();
    if (!id) return;
    navigate(`/read/gutenberg/${encodeURIComponent(id)}`);
  };

  const handleClearSearch = () => {
    setSearchInput('');
  };

  return (
    <div className="library-page">
      <div className="content-container library-shell">
        <header className="library-header">
          <div className="library-header-left">
            <h1 className="library-title">Library</h1>
            <p className="library-subtitle">
              Your personal reading space. Continue reading or explore books instantly via Gutenberg.
            </p>
          </div>

          <div className="library-header-right">
            <form
              className="library-search"
              onSubmit={(event) => event.preventDefault()}
              role="search"
              aria-label="Search books in your library"
            >
              <label className="toolbar-label" htmlFor="library-search">Search your shelf</label>
              <p className="toolbar-help">Filter by title or author.</p>
              <div className="library-search-controls">
                <input
                  id="library-search"
                  className="library-search-input"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search books or authors..."
                />
                <button
                  type="button"
                  className="library-clear-button"
                  onClick={handleClearSearch}
                  disabled={!searchInput}
                >
                  Clear
                </button>
              </div>
            </form>

            <form className="gutenberg-entry" onSubmit={handleSubmit}>
              <label htmlFor="gutenberg-id" className="toolbar-label">Open by Gutenberg ID</label>
              <p className="toolbar-help">Jump directly to a specific book.</p>
              <div className="gutenberg-controls">
                <input
                  id="gutenberg-id"
                  className="gutenberg-input"
                  value={gutenbergId}
                  onChange={(event) => setGutenbergId(event.target.value)}
                  placeholder="e.g. 1342"
                  inputMode="numeric"
                />
                <button type="submit" className="gutenberg-button">Open Book</button>
              </div>
            </form>
          </div>
        </header>

        {loading ? (
          <div className="loading">Loading books…</div>
        ) : filteredBooks.length === 0 ? (
          <div className="no-results">
            <BookOpen size={28} />
            <p>No matching books. Try another search or Gutenberg ID.</p>
          </div>
        ) : (
          <>
            <section className="books-grid" aria-label="Library books">
              {visibleBooks.map((book) => (
                <BookCard
                  key={book.gutenbergId || book._id}
                  book={book}
                  to={`/read/gutenberg/${book.gutenbergId}`}
                  actionLabel="Read"
                  actionHref={`/read/gutenberg/${book.gutenbergId}`}
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

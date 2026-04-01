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
  const loadedRef = useRef(false);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadBooks = async () => {
      try {
        const { data } = await api.get('/books');
        if (!mounted) return;
        setBooks(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('[LIBRARY] Failed to load books:', error);
        if (!mounted) return;
        setBooks([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (loadedRef.current) return undefined;
    loadedRef.current = true;
    loadBooks();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput.trim().toLowerCase());
    }, 200);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const filteredBooks = useMemo(() => {
    if (!query) return books;

    return books.filter((book) => {
      const title = String(book?.title || '').toLowerCase();
      const author = String(book?.author || '').toLowerCase();
      return title.includes(query) || author.includes(query);
    });
  }, [books, query]);

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

  const visibleBooks = useMemo(() => filteredBooks.slice(0, visibleCount), [filteredBooks, visibleCount]);

  if (!books) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    const id = String(gutenbergId || '').trim();
    if (!id) return;
    navigate(`/read/gutenberg/${encodeURIComponent(id)}`);
  };

  return (
    <div className="library-page">
      <div className="content-container library-shell">
        <header className="library-header">
          <h1 className="library-title">Library</h1>
          <p className="library-subtitle">Browse your books and jump into a Gutenberg read.</p>

          <div className="library-toolbar-panel">
            <label className="library-search" htmlFor="library-search">
              <span className="toolbar-label">Search</span>
              <input
                id="library-search"
                className="library-search-input"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search books..."
              />
            </label>

            <form className="gutenberg-entry" onSubmit={handleSubmit}>
              <label htmlFor="gutenberg-id" className="toolbar-label">Enter Gutenberg ID</label>
              <div className="gutenberg-controls">
                <input
                  id="gutenberg-id"
                  className="gutenberg-input"
                  value={gutenbergId}
                  onChange={(event) => setGutenbergId(event.target.value)}
                  placeholder="e.g. 1342"
                  inputMode="numeric"
                />
                <button type="submit" className="gutenberg-button">Read Book</button>
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

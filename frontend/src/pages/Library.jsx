import React, { useEffect, useMemo, useRef, useState } from 'react';
import SearchBar from '../components/library/SearchBar';
import BookGrid from '../components/library/BookGrid';
import {
  addRecentBook,
  fallbackBooks,
  fetchBookByGutenbergId,
  fetchBooksByIds,
  readRecentBooks,
  searchBooks,
} from '../utils/libraryApi';
import './Library.css';

const mergeUniqueBooks = (...sources) => {
  const seen = new Set();
  return sources
    .flat()
    .filter(Boolean)
    .filter((book) => {
      const id = Number(book?.gutenbergId);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

const Library = () => {
  const [baseBooks, setBaseBooks] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState('');

  const searchAbortRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const loadBooks = async () => {
      setLoading(true);
      setError('');

      const recent = readRecentBooks();
      const fallbackIds = fallbackBooks.map((book) => Number(book.gutenbergId));
      const recentIds = recent.map((book) => Number(book.gutenbergId));

      try {
        const dynamicBooks = await fetchBooksByIds([...fallbackIds, ...recentIds]);
        if (!mounted) return;

        const fallbackResolved = fallbackBooks.map((book) => ({
          ...book,
          tags: [],
        }));

        const nextBooks = mergeUniqueBooks(dynamicBooks, recent, fallbackResolved);
        setBaseBooks(nextBooks);
      } catch {
        if (!mounted) return;
        const resilientFallback = fallbackBooks.map((book) => ({ ...book, tags: [] }));
        setBaseBooks(mergeUniqueBooks(recent, resilientFallback));
        setError('Some books could not be loaded. Showing available titles.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadBooks();
    return () => {
      mounted = false;
      searchAbortRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    const term = query.trim();
    searchAbortRef.current?.abort?.();

    if (!term) {
      setSearchLoading(false);
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;

    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchBooks(term, controller.signal);
        setSearchResults(results);
      } catch (searchError) {
        if (searchError?.name === 'AbortError') return;
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const visibleBooks = useMemo(() => (query.trim() ? searchResults : baseBooks), [query, searchResults, baseBooks]);
  const subtitleCount = visibleBooks.length;

  const handleOpenBook = async (book) => {
    try {
      await fetchBookByGutenbergId(book?.gutenbergId);
      addRecentBook(book);
    } catch {
      // Silent resilience path; card navigation still works.
    }
  };

  return (
    <main className="library-page content-container">
      <header className="library-header">
        <h1>Library</h1>
        <p>Browse our complete collection of {subtitleCount} books</p>
        <SearchBar value={query} onChange={setQuery} loading={searchLoading} />
      </header>

      <section className="library-section" aria-label="All books">
        <h2>All Books</h2>
        <div onClickCapture={(event) => {
          const card = event.target.closest('[href^="/read/gutenberg/"]');
          if (!card) return;
          const match = card.getAttribute('href')?.match(/(\d+)/);
          if (!match) return;
          const selected = visibleBooks.find((book) => Number(book.gutenbergId) === Number(match[1]));
          if (selected) handleOpenBook(selected);
        }}>
          <BookGrid
            books={visibleBooks}
            loading={loading || searchLoading}
            error={error}
          />
        </div>
      </section>
    </main>
  );
};

export default Library;

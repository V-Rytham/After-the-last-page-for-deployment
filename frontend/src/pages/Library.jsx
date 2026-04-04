import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BookShelf from '../components/library/BookShelf';
import GutenbergInput from '../components/library/GutenbergInput';
import {
  addRecentBook,
  fetchBookByGutenbergId,
  fetchBooksFromCatalog,
  fetchPopularGutenbergBooks,
  readRecentBooks,
  searchGutendexBooks,
} from '../utils/libraryApi';
import { getReadingSessionsForCurrentUser } from '../utils/readingSession';
import './Library.css';

const toBookMap = (books = []) => new Map(books.map((book) => [Number(book.gutenbergId), book]));

const hydrateFromSessions = (sessions, fallbackById) => Object.entries(sessions || {})
  .map(([sessionBookId, session]) => {
    const idMatch = String(sessionBookId).match(/(\d+)/);
    const gutenbergId = Number(idMatch?.[1] || 0);
    if (!Number.isFinite(gutenbergId) || gutenbergId <= 0) return null;

    return {
      ...(fallbackById.get(gutenbergId) || {
        gutenbergId,
        title: `Gutenberg #${gutenbergId}`,
        author: 'Unknown author',
      }),
      session,
    };
  })
  .filter(Boolean)
  .sort((a, b) => new Date(b.session?.lastOpenedAt || 0) - new Date(a.session?.lastOpenedAt || 0));

const Library = () => {
  const navigate = useNavigate();

  const [catalogBooks, setCatalogBooks] = useState([]);
  const [popularBooks, setPopularBooks] = useState([]);
  const [recentBooks, setRecentBooks] = useState(() => readRecentBooks());
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [popularLoading, setPopularLoading] = useState(true);
  const [manualLoading, setManualLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const [catalogError, setCatalogError] = useState('');
  const [popularError, setPopularError] = useState('');
  const [manualError, setManualError] = useState('');
  const [searchError, setSearchError] = useState('');

  const latestSearchRequestRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError('');
      try {
        const books = await fetchBooksFromCatalog();
        if (!mounted) return;
        setCatalogBooks(books);
      } catch {
        if (!mounted) return;
        setCatalogBooks([]);
        setCatalogError('Live catalog is temporarily unavailable. Showing fallback shelves.');
      } finally {
        if (mounted) setCatalogLoading(false);
      }
    };

    loadCatalog();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadPopular = async () => {
      setPopularLoading(true);
      setPopularError('');
      try {
        const books = await fetchPopularGutenbergBooks();
        if (!mounted) return;
        setPopularBooks(books);
      } catch {
        if (!mounted) return;
        setPopularBooks([]);
        setPopularError('Popular shelf could not be loaded right now.');
      } finally {
        if (mounted) setPopularLoading(false);
      }
    };

    loadPopular();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const term = String(searchTerm || '').trim();
    if (!term) {
      setSearchResults([]);
      setSearchError('');
      setSearchLoading(false);
      latestSearchRequestRef.current?.abort?.();
      return;
    }

    const controller = new AbortController();
    latestSearchRequestRef.current?.abort?.();
    latestSearchRequestRef.current = controller;

    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');
      try {
        const results = await searchGutendexBooks(term, controller.signal);
        setSearchResults(results);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        setSearchError('Search is unavailable right now. Please retry in a moment.');
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [searchTerm]);

  const fallbackById = useMemo(() => toBookMap([...catalogBooks, ...recentBooks, ...popularBooks, ...searchResults]), [catalogBooks, popularBooks, recentBooks, searchResults]);

  const sessionBooks = useMemo(() => hydrateFromSessions(getReadingSessionsForCurrentUser(), fallbackById), [fallbackById]);

  const continueReading = useMemo(
    () => sessionBooks.filter((book) => Number(book?.session?.progressPercent || 0) > 0 && Number(book?.session?.progressPercent || 0) < 100).slice(0, 12),
    [sessionBooks],
  );

  const recentlyOpened = useMemo(() => {
    const fromSessions = sessionBooks.filter((book) => !continueReading.some((entry) => entry.gutenbergId === book.gutenbergId));
    const merged = [...recentBooks, ...fromSessions]
      .reduce((acc, book) => {
        if (!acc.some((entry) => entry.gutenbergId === book.gutenbergId)) acc.push(book);
        return acc;
      }, [])
      .slice(0, 12);

    return merged;
  }, [continueReading, recentBooks, sessionBooks]);

  const handleOpenBook = async (inputId) => {
    setManualLoading(true);
    setManualError('');

    try {
      const book = await fetchBookByGutenbergId(inputId);
      const nextRecent = addRecentBook(book);
      setRecentBooks(nextRecent);
      navigate(`/read/gutenberg/${book.gutenbergId}`);
    } catch (error) {
      setManualError(error?.uiMessage || error?.message || 'Could not open this Gutenberg book.');
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div className="library-page">
      <div className="content-container library-v2-shell">
        <header className="library-v2-header">
          <div>
            <h1>Library</h1>
            <p>Discover, reopen, and continue reading Gutenberg books with resilient shelves.</p>
          </div>

          <div className="library-v2-tools">
            <div className="library-search-wrap">
              <Search size={16} aria-hidden="true" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search Gutenberg books"
                aria-label="Search Gutenberg books"
              />
            </div>
            <GutenbergInput onSubmit={handleOpenBook} loading={manualLoading} />
            {manualError ? <p className="library-global-error">{manualError}</p> : null}
          </div>
        </header>

        <BookShelf
          title="Continue Reading"
          description="Books where your reading session is in progress."
          books={continueReading}
          loading={catalogLoading}
          emptyMessage="No active reading sessions yet."
        />

        <BookShelf
          title="Recently Opened"
          description="Quick return to books you opened recently."
          books={recentlyOpened}
          loading={false}
          emptyMessage="No recent books. Open one with a Gutenberg ID."
        />

        <BookShelf
          title="Popular Gutenberg Books"
          description="Fallback curated titles so discovery always works."
          books={popularBooks}
          loading={popularLoading}
          error={popularError}
          emptyMessage="Popular shelf unavailable."
        />

        {searchTerm.trim() ? (
          <BookShelf
            title="Search Results"
            description="Live Gutenberg search results."
            books={searchResults}
            loading={searchLoading}
            error={searchError}
            emptyMessage="No results for this query yet."
          />
        ) : null}

        <BookShelf
          title="Catalog Pulse"
          description="Recent backend catalog metadata when available."
          books={catalogBooks.slice(0, 12)}
          loading={catalogLoading}
          error={catalogError}
          emptyMessage="Catalog is unavailable, but discovery shelves remain active."
        />
      </div>
    </div>
  );
};

export default Library;

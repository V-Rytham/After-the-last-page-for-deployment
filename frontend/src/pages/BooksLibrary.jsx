import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import BookCard from '../components/books/BookCard';
import { getBestCoverUrl } from '../utils/openLibraryCovers';
import api from '../utils/api';
import { getReadingSessionsForCurrentUser } from '../utils/readingSession';
import './BooksLibrary.css';

const getRecommendationsFromResponse = (payload) => {
  const recommendations = payload?.recommendations;
  if (!recommendations) return [];

  if (Array.isArray(recommendations)) return recommendations;

  if (typeof recommendations === 'object') {
    return Object.values(recommendations)
      .flatMap((shelf) => (Array.isArray(shelf) ? shelf : []));
  }

  return [];
};

const deskDataCache = {
  books: null,
  recommendations: null,
};

const getBookKey = (book) => String(book?._id || book?.gutenbergId || `${book?.title || 'book'}-${book?.author || 'unknown'}`);

const pickRecommenderBaseBook = (allBooks) => {
  if (!Array.isArray(allBooks) || allBooks.length === 0) return null;
  return getLastAccessedBook(allBooks) || allBooks[0] || null;
};

const requestRecommendations = async ({ book, readBookIds, currentBookId, limitPerShelf }) => {
  const payloads = [
    { book, readBookIds, currentBookId, limitPerShelf },
    {
      book,
      readBookIds,
      currentBookId,
      currentlyReadingBookId: currentBookId,
      readBooksIds: readBookIds,
      limitPerShelf,
    },
  ];

  let lastError = null;
  for (const payload of payloads) {
    try {
      const response = await api.post('/recommender', payload);
      return response?.data || null;
    } catch (error) {
      lastError = error;
      if (error?.statusCode && error.statusCode < 500) {
        throw error;
      }
    }
  }

  throw lastError;
};

const getLastAccessedBook = (allBooks) => {
  if (!Array.isArray(allBooks) || allBooks.length === 0) return null;

  return [...allBooks].sort((a, b) => {
    const aDate = new Date(a?.lastAccessedAt || a?.lastAccessed || a?.updatedAt || a?.createdAt || 0).getTime();
    const bDate = new Date(b?.lastAccessedAt || b?.lastAccessed || b?.updatedAt || b?.createdAt || 0).getTime();
    return bDate - aDate;
  })[0] || null;
};

const getBookReadingState = (book, sessions) => {
  const keys = [book?._id, book?.id, String(book?.gutenbergId || '')].filter(Boolean).map(String);
  const session = keys.map((key) => sessions[key]).find(Boolean);
  if (!session) return 'Added';
  if (session?.isFinished || Number(session?.progressPercent) >= 100) return 'Finished';
  if (Number(session?.progressPercent) > 0) return `In progress · ${Math.round(session.progressPercent)}%`;
  return 'Started';
};

const ShelfCover = ({ book }) => {
  const coverUrl = getBestCoverUrl(book);

  return (
    <Link className="shelf-item" to={`/read/gutenberg/${book.gutenbergId}`} aria-label={`Open ${book?.title || 'book'}`}>
      <div className="shelf-cover-wrap">
        {coverUrl ? (
          <img src={coverUrl} alt={`${book?.title || 'Book'} cover`} className="shelf-cover-image" loading="lazy" decoding="async" />
        ) : (
          <div className="shelf-cover-fallback" aria-hidden="true">
            <span>{(book?.title || '?').slice(0, 1).toUpperCase()}</span>
          </div>
        )}
      </div>
      <h3>{book?.title || 'Untitled'}</h3>
      <p>{book?.author || 'Unknown author'}</p>
    </Link>
  );
};

const BooksLibrary = () => {
  const [books, setBooks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [sessions, setSessions] = useState({});
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);
  const cache = useRef(null);

  useEffect(() => {
    let mounted = true;

    const fetchDeskData = async () => {
      if (cache.current) return cache.current;

      const { data } = await api.get('/books');
      const allBooks = Array.isArray(data) ? data : [];
      const readBookIds = allBooks.map((book) => String(book?._id || '')).filter(Boolean);
      const recommenderBook = pickRecommenderBaseBook(allBooks);
      const currentBookId = recommenderBook?._id ? String(recommenderBook._id) : (readBookIds[0] || undefined);

      let recBooks = [];
      if (readBookIds.length && recommenderBook) {
        try {
          const recData = await requestRecommendations({
            book: {
              gutenbergId: recommenderBook.gutenbergId,
              title: recommenderBook.title,
              author: recommenderBook.author,
            },
            readBookIds,
            currentBookId,
            limitPerShelf: 12,
          });

          const deduped = [];
          const seen = new Set(readBookIds.map(String));
          getRecommendationsFromResponse(recData).forEach((book) => {
            const key = getBookKey(book);
            if (!seen.has(key)) {
              seen.add(key);
              deduped.push(book);
            }
          });
          recBooks = deduped.slice(0, 12);
        } catch (recommendationError) {
          if (recommendationError?.statusCode === 404) {
            console.warn('[DESK] Recommender endpoint unavailable (404). Continuing without recommendations.');
          } else {
            console.warn('[DESK] Recommender request failed. Continuing without recommendations.', recommendationError);
          }
        }
      }

      const payload = { books: allBooks, recommendations: recBooks };
      cache.current = payload;
      deskDataCache.books = allBooks;
      deskDataCache.recommendations = recBooks;
      return payload;
    };

    const loadDesk = async () => {
      try {
        if (deskDataCache.books && deskDataCache.recommendations) {
          setBooks(deskDataCache.books);
          setRecommendations(deskDataCache.recommendations);
          setSessions(getReadingSessionsForCurrentUser());
          setLoading(false);
          return;
        }

        const payload = await fetchDeskData();
        if (!mounted) return;
        setBooks(payload.books);
        setRecommendations(payload.recommendations);
        setSessions(getReadingSessionsForCurrentUser());
      } catch (error) {
        console.error('[DESK] Failed to load desk data:', error);
        if (!mounted) return;

        setBooks(Array.isArray(deskDataCache.books) ? deskDataCache.books : []);
        setRecommendations(Array.isArray(deskDataCache.recommendations) ? deskDataCache.recommendations : []);
        setSessions(getReadingSessionsForCurrentUser());
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (loadedRef.current) return undefined;
    loadedRef.current = true;
    loadDesk();

    return () => {
      mounted = false;
    };
  }, []);

  const continueBook = useMemo(() => getLastAccessedBook(books), [books]);
  const shelfBooks = useMemo(() => [...books]
    .sort((a, b) => {
      const aDate = new Date(a?.lastAccessedAt || a?.updatedAt || 0).getTime();
      const bDate = new Date(b?.lastAccessedAt || b?.updatedAt || 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 12), [books]);

  return (
    <div className="desk-page">
      <div className="content-container desk-shell">
        <header className="desk-header">
          <div>
            <h1>Your Desk</h1>
            <p>A personal space for your active reads, tailored picks, and shelf.</p>
          </div>
          <div className="desk-header-actions">
            <Link className="btn-resume btn-resume--ghost" to="/library">Browse library</Link>
            {continueBook?.gutenbergId && (
              <Link className="btn-resume" to={`/read/gutenberg/${continueBook.gutenbergId}`}>Continue reading</Link>
            )}
          </div>
        </header>

        <section className="desk-section" aria-label="Continue reading">
          <div className="section-heading">
            <h2>Continue Reading</h2>
          </div>
          {loading ? (
            <div className="loading">Loading your desk…</div>
          ) : continueBook ? (
            <article className="continue-card">
              <div className="continue-cover">
                <BookCard book={continueBook} to={`/read/gutenberg/${continueBook.gutenbergId}`} compact />
              </div>
              <div className="continue-copy">
                <h3>{continueBook.title}</h3>
                <p>{continueBook.author || 'Unknown author'}</p>
                <span className="continue-progress">Progress: In progress</span>
                <div className="continue-actions">
                  <Link className="btn-resume" to={`/read/gutenberg/${continueBook.gutenbergId}`}>Resume book</Link>
                </div>
              </div>
            </article>
          ) : (
            <div className="no-results">
              <BookOpen size={24} />
              <p>No recent books yet.</p>
            </div>
          )}
        </section>

        <section className="desk-section" aria-label="Recommendations">
          <div className="section-heading">
            <h2>Recommendations</h2>
          </div>
          {recommendations.length === 0 ? (
            <div className="no-results"><p>Discover more books as you read.</p></div>
          ) : (
            <div className="books-grid">
              {recommendations.map((book) => (
                <BookCard
                  key={getBookKey(book)}
                  book={book}
                  to={book.gutenbergId ? `/read/gutenberg/${book.gutenbergId}` : '/library'}
                  compact
                  className="desk-grid-card"
                />
              ))}
            </div>
          )}
        </section>

        <section className="desk-section" aria-label="Your shelf">
          <div className="section-heading">
            <h2>Your Shelf</h2>
          </div>

          {shelfBooks.length === 0 ? (
            <div className="no-results"><p>Your shelf is empty.</p></div>
          ) : (
            <div className="shelf-grid">
              {shelfBooks.map((book) => (
                <div key={getBookKey(book)} className="shelf-cell">
                  <ShelfCover book={book} />
                  <span className="shelf-status">{getBookReadingState(book, sessions)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default BooksLibrary;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import BookCard from '../components/books/BookCard';
import api from '../utils/api';
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

const requestRecommendations = async ({ readBookIds, currentBookId, limitPerShelf }) => {
  const payloads = [
    { readBookIds, currentBookId, limitPerShelf },
    {
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

const scrollByPage = (ref, direction) => {
  const el = ref.current;
  if (!el) return;
  const amount = Math.max(el.clientWidth * 0.85, 240);
  el.scrollBy({ left: direction * amount, behavior: 'smooth' });
};

const BooksLibrary = () => {
  const [books, setBooks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);
  const cache = useRef(null);
  const shelfRowRef = useRef(null);
  const recommendationRowRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const fetchDeskData = async () => {
      if (cache.current) return cache.current;

      const { data } = await api.get('/books');
      const allBooks = Array.isArray(data) ? data : [];
      const readBookIds = allBooks.map((book) => String(book?._id || '')).filter(Boolean);
      const currentBookId = readBookIds[0] || undefined;

      let recBooks = [];
      if (readBookIds.length) {
        try {
          const recData = await requestRecommendations({
            readBookIds,
            currentBookId,
            limitPerShelf: 8,
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
          recBooks = deduped.slice(0, 8);
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
          setLoading(false);
          return;
        }

        const payload = await fetchDeskData();
        if (!mounted) return;
        setBooks(payload.books);
        setRecommendations(payload.recommendations);
      } catch (error) {
        console.error('[DESK] Failed to load desk data:', error);
        if (!mounted) return;

        setBooks(Array.isArray(deskDataCache.books) ? deskDataCache.books : []);
        setRecommendations(Array.isArray(deskDataCache.recommendations) ? deskDataCache.recommendations : []);
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
  const shelfBooks = useMemo(() => books.slice(0, 8), [books]);

  return (
    <div className="desk-page">
      <div className="content-container desk-shell">
        <header className="desk-header">
          <h1>Your Desk</h1>
          <p>Your active reading space, shelf, and recommendations.</p>
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
              </div>
              <Link className="btn-resume" to={`/read/gutenberg/${continueBook.gutenbergId}`}>Resume</Link>
            </article>
          ) : (
            <div className="no-results">
              <BookOpen size={24} />
              <p>No recent books yet.</p>
            </div>
          )}
        </section>

        <section className="desk-section" aria-label="Your shelf">
          <div className="section-heading section-heading--with-controls">
            <h2>Your Shelf</h2>
            <div className="row-controls" aria-label="Shelf carousel controls">
              <button type="button" className="row-control-btn" onClick={() => scrollByPage(shelfRowRef, -1)} aria-label="Scroll shelf left">
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="row-control-btn" onClick={() => scrollByPage(shelfRowRef, 1)} aria-label="Scroll shelf right">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {shelfBooks.length === 0 ? (
            <div className="no-results"><p>Your shelf is empty.</p></div>
          ) : (
            <div className="books-carousel" ref={shelfRowRef}>
              {shelfBooks.map((book) => (
                <BookCard key={getBookKey(book)} book={book} to={`/read/gutenberg/${book.gutenbergId}`} compact className="desk-carousel-card" />
              ))}
            </div>
          )}
        </section>

        <section className="desk-section" aria-label="Recommendations">
          <div className="section-heading section-heading--with-controls">
            <h2>Recommendations</h2>
            <div className="row-controls" aria-label="Recommendations carousel controls">
              <button type="button" className="row-control-btn" onClick={() => scrollByPage(recommendationRowRef, -1)} aria-label="Scroll recommendations left">
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="row-control-btn" onClick={() => scrollByPage(recommendationRowRef, 1)} aria-label="Scroll recommendations right">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          {recommendations.length === 0 ? (
            <div className="no-results"><p>No recommendations yet.</p></div>
          ) : (
            <div className="books-carousel" ref={recommendationRowRef}>
              {recommendations.map((book) => (
                <BookCard
                  key={getBookKey(book)}
                  book={book}
                  to={book.gutenbergId ? `/read/gutenberg/${book.gutenbergId}` : '/library'}
                  compact
                  className="desk-carousel-card"
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default BooksLibrary;

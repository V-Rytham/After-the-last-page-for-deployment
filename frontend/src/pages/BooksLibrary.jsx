import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../utils/api';
import { getReadingSessionsForCurrentUser, getUserShelf } from '../utils/readingSession';
import DeskHeader from '../components/desk/DeskHeader';
import CurrentReadingCard from '../components/desk/CurrentReadingCard';
import BookCardEditorial from '../components/desk/BookCardEditorial';
import ShelfEmptyState from '../components/desk/ShelfEmptyState';
import RecommendationRow from '../components/desk/RecommendationRow';
import './BooksLibrary.css';

const deskDataCache = {
  books: null,
  recommendations: null,
};

const getBookKey = (book) => String(book?._id || book?.gutenbergId || `${book?.title || 'book'}-${book?.author || 'unknown'}`);

const getRecommendationsFromResponse = (payload) => {
  const recommendations = payload?.recommendations;
  if (!recommendations) return [];
  if (Array.isArray(recommendations)) return recommendations;
  if (typeof recommendations === 'object') {
    return Object.values(recommendations).flatMap((shelf) => (Array.isArray(shelf) ? shelf : []));
  }
  return [];
};

const getStatusLabel = (session) => {
  const progress = Number(session?.progressPercent || 0);
  if (progress >= 100 || session?.isFinished) return 'Finished';
  if (progress > 0) return `${Math.round(progress)}% read`;
  return 'Added';
};

const getLastActiveBook = (books, sessions) => {
  const mapped = books
    .map((book) => {
      const key = String(book?._id || book?.id || book?.gutenbergId || '');
      const session = sessions[key];
      const progress = Number(session?.progressPercent || 0);
      if (!session || progress <= 0 || progress >= 100 || session?.isFinished) return null;
      return { book, session };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.session?.lastOpenedAt || 0).getTime() - new Date(a.session?.lastOpenedAt || 0).getTime());

  return mapped[0] || null;
};

const getRecentActivity = (books, sessions) => books
  .map((book) => {
    const key = String(book?._id || book?.id || book?.gutenbergId || '');
    const session = sessions[key];
    if (!session) return null;
    return { book, session };
  })
  .filter(Boolean)
  .sort((a, b) => new Date(b.session?.lastOpenedAt || 0).getTime() - new Date(a.session?.lastOpenedAt || 0).getTime())
  .slice(0, 4);

const requestRecommendations = async ({ book, readBookIds, currentBookId, limitPerShelf }) => {
  const payloads = [
    { book, readBookIds, currentBookId, limitPerShelf },
    { book, readBookIds, currentBookId, currentlyReadingBookId: currentBookId, readBooksIds: readBookIds, limitPerShelf },
  ];

  let lastError = null;
  for (const payload of payloads) {
    try {
      const response = await api.post('/recommender', payload);
      return response?.data || null;
    } catch (error) {
      lastError = error;
      if (error?.statusCode && error.statusCode < 500) throw error;
    }
  }

  throw lastError;
};

const BooksLibrary = ({ currentUser }) => {
  const [books, setBooks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [sessions, setSessions] = useState({});
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadDesk = async () => {
      try {
        if (deskDataCache.books && deskDataCache.recommendations) {
          setBooks(deskDataCache.books);
          setRecommendations(deskDataCache.recommendations);
          setSessions(getReadingSessionsForCurrentUser());
          return;
        }

        const { data } = await api.get('/books');
        const allBooks = Array.isArray(data) ? data : [];
        const readBookIds = allBooks.map((book) => String(book?._id || '')).filter(Boolean);
        const baseBook = allBooks[0] || null;
        const currentBookId = baseBook?._id ? String(baseBook._id) : undefined;
        let recBooks = [];

        if (readBookIds.length && baseBook) {
          try {
            const recData = await requestRecommendations({
              book: { gutenbergId: baseBook.gutenbergId, title: baseBook.title, author: baseBook.author },
              readBookIds,
              currentBookId,
              limitPerShelf: 8,
            });

            const seen = new Set(readBookIds);
            recBooks = getRecommendationsFromResponse(recData)
              .filter((book) => {
                const key = getBookKey(book);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              })
              .slice(0, 4);
          } catch (error) {
            console.warn('[DESK] recommendations unavailable', error);
          }
        }

        if (!mounted) return;
        deskDataCache.books = allBooks;
        deskDataCache.recommendations = recBooks;
        setBooks(allBooks);
        setRecommendations(recBooks);
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

    if (!loadedRef.current) {
      loadedRef.current = true;
      loadDesk();
    }

    return () => {
      mounted = false;
    };
  }, []);

  const currentReading = useMemo(() => getLastActiveBook(books, sessions), [books, sessions]);
  const recentActivity = useMemo(() => getRecentActivity(books, sessions), [books, sessions]);

  const shelfBooks = useMemo(() => {
    const shelfIds = new Set(getUserShelf().map(String));
    return books.filter((book) => shelfIds.has(String(book?._id || book?.id || book?.gutenbergId || ''))).slice(0, 8);
  }, [books]);

  const recommendationTitle = `Because you read ${currentReading?.book?.title || 'your recent books'}`;

  return (
    <div className="desk-page editorial-theme">
      <div className="desk-shell">
        <DeskHeader currentUser={currentUser} />

        <section className="desk-hero" aria-label="Current reading">
          <h2>Good evening, Reader.</h2>
          {loading ? <div className="desk-skeleton desk-skeleton--hero" /> : <CurrentReadingCard book={currentReading?.book} session={currentReading?.session} />}
        </section>

        <section className="desk-section" aria-label="Recent activity">
          <div className="desk-section__heading">
            <h2>Recent activity</h2>
          </div>
          {loading ? (
            <div className="editorial-grid editorial-grid--recent">
              {Array.from({ length: 4 }).map((_, index) => <div key={`activity-skeleton-${index}`} className="desk-skeleton desk-skeleton--card" />)}
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="editorial-grid editorial-grid--recent">
              {recentActivity.map(({ book, session }) => (
                <BookCardEditorial key={getBookKey(book)} book={book} subtitle={getStatusLabel(session)} />
              ))}
            </div>
          ) : (
            <p className="desk-empty-copy">No recent reading activity yet.</p>
          )}
        </section>

        <section className="desk-section" aria-label="Your shelf">
          <div className="desk-section__heading">
            <h2>Your shelf</h2>
          </div>
          {shelfBooks.length === 0 ? (
            <ShelfEmptyState />
          ) : (
            <div className="editorial-grid editorial-grid--recent">
              {shelfBooks.slice(0, 4).map((book) => <BookCardEditorial key={getBookKey(book)} book={book} subtitle={getStatusLabel(sessions[String(book?._id || book?.id || book?.gutenbergId || '')])} />)}
            </div>
          )}
        </section>

        {recommendations.length > 0 && (
          <RecommendationRow
            title={recommendationTitle}
            subtitle="Stories with similar tags and themes."
            books={recommendations}
          />
        )}
      </div>
    </div>
  );
};

export default BooksLibrary;

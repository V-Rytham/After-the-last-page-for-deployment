import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { getReadingSessionsForCurrentUser, getUserShelf } from '../utils/readingSession';
import DeskHeader from '../components/desk/DeskHeader';
import CurrentReadingCard from '../components/desk/CurrentReadingCard';
import BookCardEditorial from '../components/desk/BookCardEditorial';
import ShelfEmptyState from '../components/desk/ShelfEmptyState';
import RecommendationRow from '../components/desk/RecommendationRow';
import './BooksLibrary.css';

const deskDataCache = {
  byUser: new Map(),
  inflightByUser: new Map(),
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

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning, Reader.';
  if (hour < 18) return 'Good afternoon, Reader.';
  return 'Good evening, Reader.';
};

const toUserCacheKey = (currentUser) => String(currentUser?._id || currentUser?.email || currentUser?.username || currentUser?.anonymousId || 'guest');

const loadDeskData = async (currentUser) => {
  const userKey = toUserCacheKey(currentUser);
  const cached = deskDataCache.byUser.get(userKey);
  if (cached) {
    return cached;
  }

  const inflight = deskDataCache.inflightByUser.get(userKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const sessions = getReadingSessionsForCurrentUser();
    const { data } = await api.get('/books');
    const allBooks = Array.isArray(data) ? data : [];
    const recentActivity = getRecentActivity(allBooks, sessions);
    const active = getLastActiveBook(allBooks, sessions);
    const recommendationBase = active?.book || recentActivity[0]?.book || allBooks[0] || null;
    const readBookIds = Object.keys(sessions).filter(Boolean);
    const candidateReadIds = readBookIds.length > 0 ? readBookIds : allBooks.map((book) => String(book?._id || '')).filter(Boolean);
    let recBooks = [];
    let recommendationError = '';

    if (recommendationBase && candidateReadIds.length > 0) {
      try {
        const response = await api.post('/recommender', {
          book: {
            gutenbergId: recommendationBase?.gutenbergId,
            title: recommendationBase?.title,
            author: recommendationBase?.author,
          },
          readBookIds: candidateReadIds,
          currentBookId: String(active?.book?._id || recommendationBase?._id || ''),
          limitPerShelf: 12,
        });

        const seen = new Set(candidateReadIds);
        recBooks = getRecommendationsFromResponse(response?.data)
          .filter((book) => {
            const key = getBookKey(book);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 8);
      } catch (error) {
        recommendationError = String(error?.uiMessage || error?.message || 'Recommendations are unavailable right now.');
      }
    }

    const payload = {
      books: allBooks,
      recommendations: recBooks,
      sessions,
      recommendationBase,
      recommendationError,
    };
    deskDataCache.byUser.set(userKey, payload);
    return payload;
  })().finally(() => {
    deskDataCache.inflightByUser.delete(userKey);
  });

  deskDataCache.inflightByUser.set(userKey, request);
  return request;
};

const BooksLibrary = ({ currentUser }) => {
  const [books, setBooks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [sessions, setSessions] = useState({});
  const [recommendationBase, setRecommendationBase] = useState(null);
  const [error, setError] = useState('');
  const [recommendationError, setRecommendationError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadDesk = async () => {
      try {
        setLoading(true);
        setError('');
        const loaded = await loadDeskData(currentUser);
        if (!mounted) return;
        setBooks(loaded.books);
        setRecommendations(loaded.recommendations);
        setSessions(loaded.sessions);
        setRecommendationBase(loaded.recommendationBase);
        setRecommendationError(loaded.recommendationError);
      } catch (error) {
        if (!mounted) return;
        setError(String(error?.uiMessage || error?.message || 'Unable to load your desk right now.'));
        setBooks([]);
        setRecommendations([]);
        setSessions(getReadingSessionsForCurrentUser());
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDesk();

    return () => {
      mounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    const handleRefresh = () => {
      setSessions(getReadingSessionsForCurrentUser());
    };

    window.addEventListener('storage', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    return () => {
      window.removeEventListener('storage', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, []);

  const currentReading = useMemo(() => getLastActiveBook(books, sessions), [books, sessions]);
  const recentActivity = useMemo(() => getRecentActivity(books, sessions), [books, sessions]);

  const shelfBooks = useMemo(() => {
    const shelfIds = new Set(getUserShelf().map(String));
    return books.filter((book) => shelfIds.has(String(book?._id || book?.id || book?.gutenbergId || ''))).slice(0, 8);
  }, [books]);

  const recommendationTitle = `Because you read ${recommendationBase?.title || currentReading?.book?.title || 'your recent books'}`;

  return (
    <div className="desk-page editorial-theme">
      <div className="desk-shell">
        <DeskHeader currentUser={currentUser} />

        <section className="desk-hero" aria-label="Current reading">
          <h2>{getGreeting()}</h2>
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
            <div className="editorial-grid editorial-grid--shelf">
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
        {!loading && recommendations.length === 0 && recommendationError && (
          <section className="desk-section" aria-label="Recommendations unavailable">
            <div className="desk-section__heading">
              <h2>{recommendationTitle}</h2>
            </div>
            <p className="desk-empty-copy">{recommendationError}</p>
          </section>
        )}
        {!loading && error && <p className="desk-empty-copy">{error}</p>}
      </div>
    </div>
  );
};

export default BooksLibrary;

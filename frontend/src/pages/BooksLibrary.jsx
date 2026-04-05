import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const DESK_CACHE_TTL_MS = 90_000;
const MAX_CARD_COUNT = 12;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const shouldRetry = (error) => {
  const status = Number(error?.statusCode || error?.response?.status || 0);
  return status === 429 || status >= 500 || !status;
};

const withRetry = async (fn, retries = 2, attempt = 0) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0 || !shouldRetry(error)) throw error;
    await sleep(Math.min(5000, 450 * (2 ** attempt)));
    return withRetry(fn, retries - 1, attempt + 1);
  }
};

const getBookKey = (book) => String(book?._id || book?.id || book?.gutenbergId || `${book?.title || 'book'}-${book?.author || 'unknown'}`);
const getBookObjectId = (book) => String(book?._id || book?.id || '');
const getBookSession = (sessions, book) => {
  if (!book) return null;
  const sessionByKey = sessions[getBookKey(book)] || sessions[getBookObjectId(book)];
  if (sessionByKey) return sessionByKey;
  const gutenbergSession = sessions[String(book?.gutenbergId || '')];
  return gutenbergSession || null;
};


const normalizeRecommendationPayload = (payload) => {
  const recommendations = payload?.recommendations ?? payload?.data?.recommendations ?? payload;
  if (!recommendations) return [];
  if (Array.isArray(recommendations)) return recommendations;
  if (typeof recommendations === 'object') {
    return Object.values(recommendations).flatMap((shelf) => (Array.isArray(shelf) ? shelf : []));
  }
  return [];
};

const getGreetingPrefix = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
};

const getDisplayName = (currentUser) => {
  const rawName = String(currentUser?.name || currentUser?.username || currentUser?.email || currentUser?.anonymousId || 'Reader').trim();
  if (!rawName) return 'Reader';
  if (rawName.includes('@')) return rawName.split('@')[0];
  if (rawName.startsWith('Reader #')) return 'Reader';
  return rawName.split(' ')[0];
};


const toUserCacheKey = (currentUser) => String(currentUser?._id || currentUser?.email || currentUser?.username || currentUser?.anonymousId || 'guest');

const getRecentActivity = (books, sessions) => books
  .map((book) => {
    const session = getBookSession(sessions, book);
    if (!session) return null;
    return { book, session };
  })
  .filter(Boolean)
  .sort((a, b) => new Date(b.session?.lastOpenedAt || 0).getTime() - new Date(a.session?.lastOpenedAt || 0).getTime())
  .slice(0, 6);

const getLastActiveBook = (books, sessions) => getRecentActivity(books, sessions)
  .find(({ session }) => Number(session?.progressPercent || 0) > 0 && Number(session?.progressPercent || 0) < 100 && !session?.isFinished)
  || null;

const getShelfBooks = (books, sessions) => {
  const shelfIds = new Set(getUserShelf().map(String));
  const saved = books.filter((book) => shelfIds.has(getBookKey(book)) || shelfIds.has(getBookObjectId(book)) || shelfIds.has(String(book?.gutenbergId || '')));

  const completed = books.filter((book) => {
    const session = getBookSession(sessions, book);
    return Boolean(session?.isFinished || Number(session?.progressPercent || 0) >= 100);
  });

  const merged = [...saved, ...completed];
  const seen = new Set();
  return merged.filter((book) => {
    const key = getBookKey(book);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 9);
};

const fetchDeskData = async () => {
  const sessions = getReadingSessionsForCurrentUser();

  const { data: booksPayload } = await withRetry(() => api.get('/books'));
  const allBooks = Array.isArray(booksPayload) ? booksPayload : [];
  const recentActivity = getRecentActivity(allBooks, sessions);
  const active = getLastActiveBook(allBooks, sessions);
  const recommendationBase = active?.book || recentActivity[0]?.book || allBooks[0] || null;

  const candidateReadIds = Object.keys(sessions)
    .map(String)
    .filter(Boolean)
    .slice(0, 120);

  let recommendationError = '';
  let recommendations = [];

  if (recommendationBase) {
    try {
      const recResponse = await withRetry(() => api.post('/recommender', {
        book: {
          gutenbergId: recommendationBase?.gutenbergId,
          title: recommendationBase?.title,
          author: recommendationBase?.author,
        },
        readBookIds: candidateReadIds,
        currentBookId: String(active?.book?._id || recommendationBase?._id || ''),
        limitPerShelf: MAX_CARD_COUNT,
      }));

      const readIdSet = new Set(candidateReadIds);
      const seen = new Set();
      recommendations = normalizeRecommendationPayload(recResponse?.data)
        .filter(Boolean)
        .filter((book) => {
          const key = getBookKey(book);
          if (!key || seen.has(key) || readIdSet.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, MAX_CARD_COUNT);

      if (recommendations.length === 0) {
        recommendationError = 'No recommendations yet. Read a bit more and we’ll tune this list.';
      }
    } catch (error) {
      recommendationError = String(error?.uiMessage || error?.message || 'Recommendations are unavailable right now.');
    }
  } else {
    recommendationError = 'Start reading a book to unlock personalized recommendations.';
  }

  return {
    books: allBooks,
    sessions,
    recommendationBase,
    recommendations,
    recommendationError,
    fetchedAt: Date.now(),
  };
};

const loadDeskData = async (currentUser, { force = false } = {}) => {
  const userKey = toUserCacheKey(currentUser);
  const cached = deskDataCache.byUser.get(userKey);

  if (!force && cached && Date.now() - cached.fetchedAt < DESK_CACHE_TTL_MS) {
    return cached;
  }

  const inflight = deskDataCache.inflightByUser.get(userKey);
  if (inflight) return inflight;

  const request = fetchDeskData()
    .then((payload) => {
      deskDataCache.byUser.set(userKey, payload);
      return payload;
    })
    .finally(() => {
      deskDataCache.inflightByUser.delete(userKey);
    });

  deskDataCache.inflightByUser.set(userKey, request);
  return request;
};

const BooksLibrary = ({ currentUser }) => {
  const [books, setBooks] = useState([]);
  const [sessions, setSessions] = useState({});
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationBase, setRecommendationBase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [error, setError] = useState('');
  const [recommendationError, setRecommendationError] = useState('');

  const refreshDesk = useCallback(async ({ force = false } = {}) => {
    try {
      setLoading(true);
      setRecommendationLoading(true);
      setError('');
      const payload = await loadDeskData(currentUser, { force });
      setBooks(payload.books);
      setSessions(payload.sessions);
      setRecommendations(payload.recommendations);
      setRecommendationBase(payload.recommendationBase);
      setRecommendationError(payload.recommendationError);
    } catch (loadError) {
      setBooks([]);
      setRecommendations([]);
      setSessions(getReadingSessionsForCurrentUser());
      setError(String(loadError?.uiMessage || loadError?.message || 'Unable to load your desk right now.'));
    } finally {
      setLoading(false);
      setRecommendationLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshDesk({ force: true });
    })();

    const refreshFromStorage = () => {
      if (!alive) return;
      setSessions(getReadingSessionsForCurrentUser());
    };

    window.addEventListener('storage', refreshFromStorage);
    window.addEventListener('focus', refreshFromStorage);

    return () => {
      alive = false;
      window.removeEventListener('storage', refreshFromStorage);
      window.removeEventListener('focus', refreshFromStorage);
    };
  }, [refreshDesk]);

  const greeting = `${getGreetingPrefix()}, ${getDisplayName(currentUser)}.`;
  const currentReading = useMemo(() => getLastActiveBook(books, sessions), [books, sessions]);
  const recentActivity = useMemo(() => getRecentActivity(books, sessions), [books, sessions]);
  const shelfBooks = useMemo(() => getShelfBooks(books, sessions), [books, sessions]);
  const sessionForBook = useCallback((book) => getBookSession(sessions, book), [sessions]);
  const recommendationTitle = `Because you read ${recommendationBase?.title || currentReading?.book?.title || 'your recent books'}`;

  return (
    <div className="desk-page editorial-theme">
      <div className="desk-shell">
        <DeskHeader />

        <section className="desk-hero" aria-label="Current reading">
          <h2>{greeting}</h2>
          {loading
            ? <div className="desk-skeleton desk-skeleton--hero" />
            : <CurrentReadingCard book={currentReading?.book} session={currentReading?.session} />}
        </section>

        <section className="desk-section" aria-label="Recent activity">
          <div className="desk-section__heading">
            <h2>Recent activity</h2>
            <p>Your latest opens, progress updates, and completions.</p>
          </div>
          {loading ? (
            <div className="editorial-grid editorial-grid--recent">
              {Array.from({ length: 6 }).map((_, index) => <div key={`activity-skeleton-${index}`} className="desk-skeleton desk-skeleton--card" />)}
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="editorial-grid editorial-grid--recent">
              {recentActivity.map(({ book, session }) => (
                <BookCardEditorial key={getBookKey(book)} book={book} session={session} />
              ))}
            </div>
          ) : (
            <p className="desk-empty-copy">No recent activity yet. Open a book to start your reading timeline.</p>
          )}
        </section>

        <section className="desk-section" aria-label="Your shelf">
          <div className="desk-section__heading">
            <h2>Your shelf</h2>
            <p>Saved books and completed reads in one place.</p>
          </div>
          {shelfBooks.length === 0 ? (
            <ShelfEmptyState />
          ) : (
            <div className="editorial-grid editorial-grid--shelf">
              {shelfBooks.map((book) => (
                <BookCardEditorial
                  key={getBookKey(book)}
                  book={book}
                  session={sessionForBook(book)}
                />
              ))}
            </div>
          )}
        </section>

        {recommendationLoading && (
          <section className="desk-section" aria-label="Recommendations loading">
            <div className="desk-section__heading">
              <h2>{recommendationTitle}</h2>
              <p>Finding books matched to your reading history.</p>
            </div>
            <div className="editorial-grid editorial-grid--recommendations">
              {Array.from({ length: 6 }).map((_, index) => <div key={`recommendation-skeleton-${index}`} className="desk-skeleton desk-skeleton--card" />)}
            </div>
          </section>
        )}

        {!recommendationLoading && recommendations.length > 0 && (
          <RecommendationRow
            title={recommendationTitle}
            subtitle="Stories with similar tags and themes."
            books={recommendations}
            getSessionForBook={sessionForBook}
          />
        )}

        {!recommendationLoading && recommendations.length === 0 && (
          <section className="desk-section" aria-label="Recommendations unavailable">
            <div className="desk-section__heading">
              <h2>{recommendationTitle}</h2>
            </div>
            <p className="desk-empty-copy">{recommendationError || 'No recommendations available yet.'}</p>
            <button type="button" className="desk-btn desk-btn--secondary" onClick={() => refreshDesk({ force: true })}>Retry recommendations</button>
          </section>
        )}

        {!loading && error && (
          <section className="desk-section" aria-label="Desk unavailable">
            <p className="desk-empty-copy">{error}</p>
            <button type="button" className="desk-btn desk-btn--secondary" onClick={() => refreshDesk({ force: true })}>Retry loading desk</button>
          </section>
        )}
      </div>
    </div>
  );
};

export default BooksLibrary;

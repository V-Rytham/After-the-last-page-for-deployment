import { getStoredUser } from './auth';

const SESSION_KEY = 'readingSessions';
const SHELF_KEY = 'userShelf';

const getActorKeyForUser = (user) => user?._id || user?.anonymousId || 'guest';

const readShelfStore = () => {
  const raw = localStorage.getItem(SHELF_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const writeShelfStore = (store) => {
  localStorage.setItem(SHELF_KEY, JSON.stringify(store));
};

export const getUserShelf = () => {
  const store = readShelfStore();
  const actorKey = getActorKeyForUser(getStoredUser());
  return store[actorKey] || [];
};

export const toggleBookOnShelf = (bookId) => {
  const store = readShelfStore();
  const actorKey = getActorKeyForUser(getStoredUser());
  const current = store[actorKey] || [];
  
  if (current.includes(bookId)) {
    store[actorKey] = current.filter(id => id !== bookId);
  } else {
    store[actorKey] = [...current, bookId];
  }
  
  writeShelfStore(store);
  return store[actorKey];
};

const readSessionStore = () => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const writeSessionStore = (store) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(store));
};

export const getReadingSessionsForCurrentUser = () => {
  const store = readSessionStore();
  const actorKey = getActorKeyForUser(getStoredUser());
  return store[actorKey] || {};
};

const setCurrentActorSession = (bookId, updates) => {
  if (!bookId) return null;
  const store = readSessionStore();
  const actorKey = getActorKeyForUser(getStoredUser());
  const actorSessions = store[actorKey] || {};

  store[actorKey] = {
    ...actorSessions,
    [bookId]: {
      ...(actorSessions[bookId] || {}),
      ...updates,
    },
  };

  writeSessionStore(store);
  return store[actorKey][bookId];
};

export const trackBookOpened = (bookId) => (
  setCurrentActorSession(bookId, {
    lastOpenedAt: new Date().toISOString(),
  })
);

export const updateReadingSession = (bookId, currentPage, totalPages) => (
  setCurrentActorSession(bookId, {
    currentPage,
    totalPages,
    progressPercent: Math.round((currentPage / totalPages) * 100),
    isFinished: currentPage >= totalPages,
    lastOpenedAt: new Date().toISOString(),
  })
);

export const getFinishedBookIds = () => {
  const sessions = getReadingSessionsForCurrentUser();
  return Object.entries(sessions)
    .filter(([, session]) => Boolean(session?.isFinished || session?.progressPercent >= 100))
    .map(([bookId]) => bookId);
};

export const getLibraryState = (books) => {
  const sessions = getReadingSessionsForCurrentUser();
  const byId = new Map(books.map((book) => [book._id || book.id, book]));

  const continueReading = Object.entries(sessions)
    .map(([bookId, session]) => ({ book: byId.get(bookId), session }))
    .filter(({ book, session }) => book && session.progressPercent > 0 && session.progressPercent < 100)
    .sort((a, b) => new Date(b.session.lastOpenedAt) - new Date(a.session.lastOpenedAt))
    .map(({ book, session }) => ({ ...book, session }));

  const continueIds = new Set(continueReading.map((book) => book._id || book.id));

  const recentlyOpened = Object.entries(sessions)
    .map(([bookId, session]) => ({ book: byId.get(bookId), session }))
    .filter(({ book }) => book)
    .sort((a, b) => new Date(b.session.lastOpenedAt) - new Date(a.session.lastOpenedAt))
    .map(({ book, session }) => ({ ...book, session }))
    .filter((book) => !continueIds.has(book._id || book.id))
    .slice(0, 8);

  const discover = books
    .map((book) => ({ ...book, session: sessions[book._id || book.id] || null }))
    .filter((book) => !continueIds.has(book._id || book.id));

  const savedBookIds = new Set(getUserShelf());
  const savedBooks = books
    .filter((book) => savedBookIds.has(book._id || book.id))
    .map((book) => ({
      ...book,
      session: sessions[book._id || book.id] || null,
    }));

  return {
    continueReading,
    recentlyOpened,
    discover,
    savedBooks,
    sessions,
  };
};

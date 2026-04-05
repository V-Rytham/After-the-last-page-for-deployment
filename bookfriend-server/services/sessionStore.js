const sessionStore = new Map();
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const SESSION_TTL_MS = parsePositiveInt(process.env.BOOKFRIEND_SESSION_TTL_MS, 2 * 60 * 60_000);
const MAX_SESSIONS = parsePositiveInt(process.env.BOOKFRIEND_MAX_SESSIONS, 1000);
const MAX_MESSAGES_PER_SESSION = parsePositiveInt(process.env.BOOKFRIEND_MAX_MESSAGES_PER_SESSION, 40);

const evictExpiredSessions = () => {
  const now = Date.now();
  for (const [key, value] of sessionStore.entries()) {
    const updatedAt = value?.updatedAt ? new Date(value.updatedAt).getTime() : 0;
    if (!updatedAt || now - updatedAt > SESSION_TTL_MS) {
      sessionStore.delete(key);
    }
  }
};

const evictOldestSession = () => {
  let oldestKey = null;
  let oldestUpdatedAt = Number.POSITIVE_INFINITY;
  for (const [key, value] of sessionStore.entries()) {
    const updatedAt = value?.updatedAt ? new Date(value.updatedAt).getTime() : 0;
    if (updatedAt < oldestUpdatedAt) {
      oldestUpdatedAt = updatedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    sessionStore.delete(oldestKey);
  }
};

const cleanupTimer = setInterval(evictExpiredSessions, 60_000);
cleanupTimer.unref?.();

export const createSession = ({ sessionId, userId, bookId, book }) => {
  evictExpiredSessions();
  while (sessionStore.size >= MAX_SESSIONS) {
    evictOldestSession();
  }

  sessionStore.set(sessionId, {
    sessionId,
    userId,
    bookId,
    book,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return sessionStore.get(sessionId);
};

export const getSession = (sessionId) => {
  const session = sessionStore.get(sessionId) || null;
  if (!session) {
    return null;
  }

  const updatedAtMs = session?.updatedAt ? new Date(session.updatedAt).getTime() : 0;
  const isExpired = !updatedAtMs || (Date.now() - updatedAtMs > SESSION_TTL_MS);
  if (isExpired) {
    sessionStore.delete(sessionId);
    return null;
  }

  return session;
};

export const appendMessage = ({ sessionId, role, content }) => {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  session.messages.push({ role, content, timestamp: new Date().toISOString() });
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  session.updatedAt = new Date();
  return session;
};

export const endSession = (sessionId) => sessionStore.delete(sessionId);

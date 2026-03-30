const sessionStore = new Map();

export const createSession = ({ sessionId, userId, bookId, book }) => {
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

export const getSession = (sessionId) => sessionStore.get(sessionId) || null;

export const appendMessage = ({ sessionId, role, content }) => {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }

  session.messages.push({ role, content, timestamp: new Date().toISOString() });
  session.updatedAt = new Date();
  return session;
};

export const endSession = (sessionId) => sessionStore.delete(sessionId);

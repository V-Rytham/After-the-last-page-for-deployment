import { randomUUID } from 'crypto';

const toCleanString = (value, maxLen = 80) => String(value || '').trim().slice(0, maxLen);

const normalizeDisplayName = (value) => {
  const cleaned = toCleanString(value, 60);
  return cleaned || `Reader${Math.floor(1000 + Math.random() * 9000)}`;
};

const inferUserIdFromRequest = (req) => {
  const fromHeader = toCleanString(req.headers['x-user-id']);
  const fromBody = toCleanString(req.body?.userId);
  const fromQuery = toCleanString(req.query?.userId);
  return fromHeader || fromBody || fromQuery || randomUUID();
};

const inferDisplayNameFromRequest = (req) => {
  const fromHeader = toCleanString(req.headers['x-display-name'], 60);
  const fromBody = toCleanString(req.body?.displayName, 60);
  const fromQuery = toCleanString(req.query?.displayName, 60);
  return normalizeDisplayName(fromHeader || fromBody || fromQuery);
};

export const attachIdentity = (req, _res, next) => {
  req.identity = {
    userId: inferUserIdFromRequest(req),
    displayName: inferDisplayNameFromRequest(req),
  };
  next();
};

export const resolveSocketIdentity = (socket) => {
  const fromAuthId = toCleanString(socket.handshake?.auth?.userId);
  const fromQueryId = toCleanString(socket.handshake?.query?.userId);
  const fromHeaderId = toCleanString(socket.handshake?.headers?.['x-user-id']);

  const fromAuthName = toCleanString(socket.handshake?.auth?.displayName, 60);
  const fromQueryName = toCleanString(socket.handshake?.query?.displayName, 60);
  const fromHeaderName = toCleanString(socket.handshake?.headers?.['x-display-name'], 60);

  return {
    userId: fromAuthId || fromQueryId || fromHeaderId || randomUUID(),
    displayName: normalizeDisplayName(fromAuthName || fromQueryName || fromHeaderName),
  };
};

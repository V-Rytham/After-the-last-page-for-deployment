import crypto from 'node:crypto';

const SLOW_REQUEST_THRESHOLD_MS = 1200;
const ACTION_WINDOW_MS = 30_000;
const findBookActionStats = new Map();

const getClientIp = (req) => String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');

export const requestTracing = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  req.requestId = crypto.randomUUID();

  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    const finishedAt = process.hrtime.bigint();
    const elapsedMs = Number(finishedAt - startedAt) / 1_000_000;
    const status = Number(res.statusCode || 0);
    const isError = status >= 500;
    const isWarn = status >= 400 || elapsedMs >= SLOW_REQUEST_THRESHOLD_MS;

    const logger = isError ? console.error : (isWarn ? console.warn : console.info);
    logger(
      `[HTTP] ${req.method} ${req.originalUrl} -> ${status} ${elapsedMs.toFixed(1)}ms `
      + `requestId=${req.requestId} ip=${getClientIp(req)}`,
    );

    if (req.originalUrl.startsWith('/api/books/preview/') || req.originalUrl === '/api/books/request') {
      const actionId = String(req.headers['x-book-action-id'] || 'missing-action-id');
      const actionName = String(req.headers['x-book-action-name'] || 'unknown-action');
      const bucket = findBookActionStats.get(actionId) || {
        actionName,
        count: 0,
        timestamps: [],
        statusDistribution: {},
        firstSeenAt: Date.now(),
      };

      bucket.count += 1;
      bucket.timestamps.push(new Date().toISOString());
      bucket.statusDistribution[status] = (bucket.statusDistribution[status] || 0) + 1;
      findBookActionStats.set(actionId, bucket);

      const metricLogger = bucket.count > 2 ? console.warn : console.info;
      metricLogger(
        `[FIND_BOOK_METRIC] actionId=${actionId} action=${actionName} requests=${bucket.count} `
        + `timestamps=${bucket.timestamps.join(',')} statuses=${JSON.stringify(bucket.statusDistribution)}`,
      );
    }
  });

  next();
};

setInterval(() => {
  const now = Date.now();
  for (const [actionId, bucket] of findBookActionStats.entries()) {
    if ((now - bucket.firstSeenAt) > ACTION_WINDOW_MS) {
      findBookActionStats.delete(actionId);
    }
  }
}, 5_000).unref?.();

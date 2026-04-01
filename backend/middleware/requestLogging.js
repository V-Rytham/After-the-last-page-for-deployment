import crypto from 'node:crypto';

const SLOW_REQUEST_THRESHOLD_MS = 1200;

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

  });

  next();
};

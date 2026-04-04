import { buildSafeErrorBody } from '../utils/runtime.js';

export const notFound = (req, res) => {
  res.status(404).json({ message: 'Not found.' });
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  console.error('[ERROR]', err);

  return res.status(200).json({
    ...buildSafeErrorBody(err?.message || 'Fallback error', err),
    error: true,
    fallback: true,
  });
};

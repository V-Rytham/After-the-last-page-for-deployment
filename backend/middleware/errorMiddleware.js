import { buildSafeErrorBody } from '../utils/runtime.js';

export const notFound = (req, res) => {
  res.status(404).json({ message: 'Not found.' });
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  // Handle malformed JSON bodies from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json(buildSafeErrorBody('Malformed JSON payload.', err));
    return;
  }

  const status = Number(err?.statusCode || err?.status || 500);
  const safeStatus = Number.isFinite(status) && status >= 400 && status <= 599 ? status : 500;
  const message = safeStatus >= 500
    ? 'Server error.'
    : (err?.message || 'Request failed.');

  res.status(safeStatus).json(buildSafeErrorBody(message, err));
};


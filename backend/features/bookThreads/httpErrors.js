export class HttpError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details = null) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Unauthorized.') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Forbidden.') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'NOT_FOUND', message);

export const sendError = (res, error, fallbackMessage = 'Request failed.') => {
  const statusCode = Number(error?.statusCode) || 500;
  const code = error?.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const message = error?.message || fallbackMessage;

  if (statusCode >= 500) {
    console.error('[THREADS]', error);
  }

  const body = {
    error: true,
    code,
    message,
  };

  if (error?.details) {
    body.details = error.details;
  }

  return res.status(statusCode).json(body);
};

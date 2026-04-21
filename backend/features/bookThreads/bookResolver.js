import { Book } from '../../models/Book.js';
import { badRequest, notFound } from './httpErrors.js';

const parseGutenbergParam = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const match = raw.match(/^gutenberg:(\d+)$/i);
  const numeric = match ? match[1] : (/^\d+$/.test(raw) ? raw : null);
  if (!numeric) return null;

  const gutenbergId = Number(numeric);
  if (!Number.isSafeInteger(gutenbergId) || gutenbergId <= 0) return null;
  return gutenbergId;
};

export const resolveBookOrThrow = async (bookIdParam) => {
  const raw = String(bookIdParam || '').trim();
  if (!raw) {
    throw badRequest('Book id is required.');
  }

  // Prefer DB object id when supplied.
  if (/^[a-fA-F0-9]{24}$/.test(raw)) {
    const book = await Book.findById(raw).select('_id title author gutenbergId').lean();
    if (!book) {
      throw notFound('Book not found.');
    }
    return book;
  }

  const gutenbergId = parseGutenbergParam(raw);
  if (!gutenbergId) {
    throw badRequest('Invalid book id.');
  }

  const book = await Book.findOne({ gutenbergId }).select('_id title author gutenbergId').lean();
  if (!book) {
    throw notFound('Book not found.');
  }

  return book;
};


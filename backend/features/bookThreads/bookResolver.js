import { Book } from '../../models/Book.js';
import { getCanonicalBook } from '../../services/canonicalBookService.js';
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
  if (gutenbergId) {
    const book = await Book.findOne({ gutenbergId }).select('_id title author gutenbergId').lean();
    if (!book) {
      throw notFound('Book not found.');
    }
    return book;
  }

  const sourceMatch = raw.match(/^([a-z0-9_-]+):(.+)$/i);
  if (!sourceMatch) {
    throw badRequest('Invalid book id.');
  }

  const source = String(sourceMatch[1] || '').trim().toLowerCase();
  const sourceBookId = String(sourceMatch[2] || '').trim();
  if (!source || !sourceBookId || source === 'custom') {
    throw badRequest('Invalid book id.');
  }

  const canonical = await getCanonicalBook({ source, source_book_id: sourceBookId });
  const canonicalId = String(canonical?.canonical_book_id || '').trim();
  if (!canonicalId) {
    throw badRequest('Invalid book id.');
  }

  const syntheticBase = Number.parseInt(canonicalId.slice(-8), 16);
  const syntheticGutenbergId = Number.isFinite(syntheticBase)
    ? 1_500_000_000 + syntheticBase
    : 1_900_000_000;

  const persisted = await Book.findOneAndUpdate(
    { gutenbergId: syntheticGutenbergId },
    {
      $set: {
        title: String(canonical?.title || sourceBookId).trim() || sourceBookId,
        author: String(canonical?.author || 'Unknown author').trim() || 'Unknown author',
        gutenbergId: syntheticGutenbergId,
        lastAccessedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).select('_id title author gutenbergId').lean();

  return persisted;
};

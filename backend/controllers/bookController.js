import { Book } from '../models/Book.js';
import mongoose from 'mongoose';
import {
  parseStrictGutenbergId,
  readGutenbergBookStateless,
} from '../utils/gutenbergReader.js';
import { gutenbergCatalog } from '../seed/gutenbergCatalog.js';

const BACKEND_TIMEOUT_MS = 70_000;

const parseOptionalPositiveInt = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : fallback;
};

const buildReaderOptions = (req) => {
  const cursor = parseOptionalPositiveInt(req.query?.cursor, 0);
  const maxChapters = parseOptionalPositiveInt(req.query?.maxChapters, null);
  const processingBudgetMs = parseOptionalPositiveInt(req.query?.processingBudgetMs, 40_000);
  return {
    cursor,
    maxChapters,
    processingBudgetMs,
    timeoutMs: BACKEND_TIMEOUT_MS,
  };
};

const mapReadErrorMessage = (statusCode) => {
  if (statusCode === 404) return 'Unable to fetch this book. Check the ID.';
  if (statusCode === 504) return 'This book is large and taking longer than expected.';
  return 'Unable to fetch this book right now. Please retry.';
};

const fetchBookByObjectId = async (routeId, projection = null) => {
  if (!mongoose.Types.ObjectId.isValid(routeId)) {
    return null;
  }

  return Book.findById(routeId).select(projection);
};

const upsertMetadata = async ({ gutenbergId, title, author }) => {
  const book = await Book.findOneAndUpdate(
    { gutenbergId },
    {
      $set: {
        title,
        author,
        gutenbergId,
        lastAccessedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).select('_id title author gutenbergId');

  return book;
};

export const getBooks = async (req, res) => {
  try {
    const books = await Book.find({})
      .select('_id title author gutenbergId')
      .sort({ lastAccessedAt: -1, _id: -1 })
      .lean();

    res.json(books);
  } catch (error) {
    console.error('[BOOK] Failed to fetch books list:', error?.message || error);
    res.status(500).json({ message: 'Server error fetching books.' });
  }
};

export const getBookById = async (req, res) => {
  try {
    const book = await fetchBookByObjectId(req.params.id, 'title author gutenbergId');
    if (!book) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }

    res.json(book);
  } catch (error) {
    console.error('[BOOK] Failed to fetch book by id:', error?.message || error);
    res.status(500).json({ message: 'Server error fetching book' });
  }
};

export const readBook = async (req, res) => {
  try {
    const book = await fetchBookByObjectId(req.params.id, 'title author gutenbergId');
    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    const payload = await readGutenbergBookStateless(book.gutenbergId, buildReaderOptions(req));
    const persisted = await upsertMetadata({
      gutenbergId: payload.gutenbergId,
      title: payload.title,
      author: payload.author,
    });
    res.json({
      ...payload,
      bookId: persisted?._id ? String(persisted._id) : String(book._id),
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({
      message: mapReadErrorMessage(statusCode),
    });
  }
};


export const getGutenbergPreview = async (req, res) => {
  try {
    const gutenbergId = parseStrictGutenbergId(req.params.gutenbergId);
    if (!gutenbergId) {
      res.status(400).json({ message: 'Invalid Gutenberg ID.' });
      return;
    }

    const existing = await Book.findOne({ gutenbergId })
      .select('_id title author gutenbergId')
      .lean();

    if (existing) {
      res.json(existing);
      return;
    }

    const catalogEntry = (Array.isArray(gutenbergCatalog) ? gutenbergCatalog : [])
      .find((book) => Number(book?.gutenbergId) === gutenbergId);

    if (!catalogEntry) {
      res.status(404).json({ message: 'Book preview not found for this Gutenberg ID.' });
      return;
    }

    res.json({
      gutenbergId,
      title: catalogEntry.title || 'Untitled',
      author: catalogEntry.author || 'Unknown author',
    });
  } catch (error) {
    console.error('[BOOK] Failed to fetch Gutenberg preview:', error?.message || error);
    res.status(500).json({ message: 'Server error fetching Gutenberg preview.' });
  }
};

export const readGutenbergBook = async (req, res) => {
  try {
    const gutenbergId = parseStrictGutenbergId(req.params.gutenbergId);
    if (!gutenbergId) {
      res.status(400).json({ message: 'Invalid Gutenberg ID.' });
      return;
    }

    const payload = await readGutenbergBookStateless(gutenbergId, buildReaderOptions(req));
    const persisted = await upsertMetadata({
      gutenbergId: payload.gutenbergId,
      title: payload.title,
      author: payload.author,
    });
    res.json({
      ...payload,
      bookId: persisted?._id ? String(persisted._id) : null,
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({
      message: mapReadErrorMessage(statusCode),
    });
  }
};

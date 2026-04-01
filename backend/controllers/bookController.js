import { Book } from '../models/Book.js';
import mongoose from 'mongoose';
import {
  parseStrictGutenbergId,
  fetchGutenbergMetadata,
  readGutenbergBookStateless,
} from '../utils/gutenbergReader.js';

const fetchBookByObjectId = async (routeId, projection = null) => {
  if (!mongoose.Types.ObjectId.isValid(routeId)) {
    return null;
  }

  return Book.findById(routeId).select(projection);
};

const ensureMetadata = async (gutenbergId) => {
  let book = await Book.findOne({ gutenbergId }).select('_id title author gutenbergId');
  if (book) return book;

  const metadata = await fetchGutenbergMetadata(gutenbergId);
  book = await Book.findOneAndUpdate(
    { gutenbergId },
    {
      $setOnInsert: {
        title: metadata.title,
        author: metadata.author,
        gutenbergId: metadata.gutenbergId,
      },
      $set: {
        title: metadata.title,
        author: metadata.author,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).select('_id title author gutenbergId');

  return book;
};

export const getBooks = async (req, res) => {
  try {
    const page = Number.parseInt(String(req.query?.page ?? '1'), 10);
    const requestedLimit = Number.parseInt(String(req.query?.limit ?? '24'), 10);

    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(requestedLimit)
      ? Math.min(50, Math.max(1, requestedLimit))
      : 24;

    const [books, totalCount] = await Promise.all([
      Book.find({})
        .select('title author gutenbergId')
        .sort({ title: 1, _id: 1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Book.countDocuments({}),
    ]);

    res.setHeader('X-Page', String(safePage));
    res.setHeader('X-Limit', String(safeLimit));
    res.setHeader('X-Total-Count', String(totalCount));
    res.setHeader('X-Has-More', String(safePage * safeLimit < totalCount));
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

    const payload = await readGutenbergBookStateless(book.gutenbergId);
    res.json(payload);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const message = statusCode === 404
      ? 'Book not found'
      : statusCode === 504
        ? 'Book is taking too long to load. Try again.'
        : statusCode === 413
          ? 'Book too large to load'
          : 'Something went wrong';
    res.status(statusCode).json({
      message,
    });
  }
};

export const readGutenbergBook = async (req, res) => {
  try {
    const gutenbergId = parseStrictGutenbergId(req.params.gutenbergId);
    if (!gutenbergId) {
      res.status(400).json({ message: 'Invalid Gutenberg ID.' });
      return;
    }

    await ensureMetadata(gutenbergId);
    const payload = await readGutenbergBookStateless(gutenbergId);
    res.json(payload);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const message = statusCode === 404
      ? 'Book not found'
      : statusCode === 504
        ? 'Book is taking too long to load. Try again.'
        : statusCode === 413
          ? 'Book too large to load'
          : 'Something went wrong';
    res.status(statusCode).json({
      message,
    });
  }
};

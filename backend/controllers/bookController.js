import { Book } from '../models/Book.js';
import mongoose from 'mongoose';
import {
  parseStrictGutenbergId,
  readGutenbergBookStateless,
} from '../utils/gutenbergReader.js';

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

    const payload = await readGutenbergBookStateless(book.gutenbergId);
    await upsertMetadata({
      gutenbergId: payload.gutenbergId,
      title: payload.title,
      author: payload.author,
    });
    res.json(payload);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({
      message: statusCode === 404 ? 'Book content not found on Gutenberg.' : 'Unable to fetch this book. Check the ID.',
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

    const payload = await readGutenbergBookStateless(gutenbergId);
    await upsertMetadata({
      gutenbergId: payload.gutenbergId,
      title: payload.title,
      author: payload.author,
    });
    res.json(payload);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({
      message: statusCode === 404 ? 'Unable to fetch this book. Check the ID.' : 'Unable to fetch this book. Check the ID.',
    });
  }
};

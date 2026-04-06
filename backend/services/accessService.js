import mongoose from 'mongoose';
import { Book } from '../models/Book.js';
import { UserProgress } from '../models/UserProgress.js';

export const resolveBookOrThrow = async (bookId) => {
  if (!mongoose.Types.ObjectId.isValid(bookId)) {
    const error = new Error('Invalid book reference.');
    error.statusCode = 400;
    throw error;
  }

  const book = await Book.findById(bookId).select('_id');
  if (!book) {
    const error = new Error('Book not found.');
    error.statusCode = 404;
    throw error;
  }

  return book;
};

export const checkQuizAccess = async ({ userId, bookId }) => {
  if (!userId) {
    const error = new Error('Unauthorized.');
    error.statusCode = 401;
    throw error;
  }

  await resolveBookOrThrow(bookId);
  const progress = await UserProgress.findOne({ userId, bookId }).select('quizAttempted quizPassed score attemptedAt');
  const access = true;

  return {
    access,
    progress: progress
      ? {
          quizAttempted: Boolean(progress.quizAttempted),
          quizPassed: Boolean(progress.quizPassed),
          score: Number(progress.score || 0),
          attemptedAt: progress.attemptedAt || null,
        }
      : null,
  };
};

export const checkMeetAccess = async ({ userId, bookId }) => {
  if (!userId) {
    const error = new Error('Unauthorized.');
    error.statusCode = 401;
    throw error;
  }

  const normalizedBookId = String(bookId || '').trim();
  if (!normalizedBookId) {
    return { access: false, mode: 'invalid' };
  }

  // Meet is open: matching is based on a shared book identifier (e.g. "gutenberg:1342" or "custom:atomic habits").
  return { access: true, mode: 'open' };
};

export const grantMeetFallback = async ({ userId, bookId, reason }) => {
  if (!userId) {
    const error = new Error('Unauthorized.');
    error.statusCode = 401;
    throw error;
  }

  const normalizedBookId = String(bookId || '').trim();
  if (!normalizedBookId) {
    const error = new Error('bookId is required.');
    error.statusCode = 400;
    throw error;
  }

  // Backwards-compat no-op: Meet no longer requires fallback/unlock flows.
  const trimmedReason = String(reason || '').trim().slice(0, 180);
  void trimmedReason;
  return { ok: true, noop: true };
};

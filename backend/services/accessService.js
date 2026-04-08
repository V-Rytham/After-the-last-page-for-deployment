import mongoose from 'mongoose';
import { Book } from '../models/Book.js';
import { UserProgress } from '../models/UserProgress.js';
import { canCreateArchiveRooms, splitCompositeSourceId } from './bookAggregationService.js';

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

  // Meet is open by default, but Archive.org entries require open-access readability.
  const parsed = splitCompositeSourceId(normalizedBookId);
  if (parsed?.source === 'archive' || parsed?.source === 'internetarchive') {
    const allowed = await canCreateArchiveRooms({ source: parsed.source, sourceId: parsed.sourceId });
    if (!allowed) {
      return {
        access: false,
        mode: 'restricted',
        message: 'Live reading rooms are only available for open-access books.',
      };
    }
  }

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

import mongoose from 'mongoose';
import { Book } from '../models/Book.js';
import { UserProgress } from '../models/UserProgress.js';

const isMeetFallbackEnabled = () => {
  const raw = String(process.env.ALLOW_MEET_FALLBACK_ON_QUIZ_ERROR ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
};

const getMeetFallbackTtlMs = () => {
  const hours = Number.parseInt(process.env.MEET_FALLBACK_TTL_HOURS || '24', 10);
  const normalized = Number.isFinite(hours) ? Math.max(1, Math.min(168, hours)) : 24;
  return normalized * 60 * 60 * 1000;
};

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
  const access = Boolean(progress?.quizAttempted && progress?.quizPassed);

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
  const quiz = await checkQuizAccess({ userId, bookId });
  if (quiz.access) {
    return { access: true, mode: 'quiz' };
  }

  if (!isMeetFallbackEnabled()) {
    return { access: false, mode: 'none' };
  }

  const progress = await UserProgress.findOne({ userId, bookId }).select('meetFallbackGranted meetFallbackGrantedAt');
  if (!progress?.meetFallbackGranted || !progress.meetFallbackGrantedAt) {
    return { access: false, mode: 'none' };
  }

  const ageMs = Date.now() - new Date(progress.meetFallbackGrantedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > getMeetFallbackTtlMs()) {
    return { access: false, mode: 'expired' };
  }

  return { access: true, mode: 'fallback' };
};

export const grantMeetFallback = async ({ userId, bookId, reason }) => {
  if (!userId) {
    const error = new Error('Unauthorized.');
    error.statusCode = 401;
    throw error;
  }

  await resolveBookOrThrow(bookId);

  if (!isMeetFallbackEnabled()) {
    const error = new Error('Meet fallback is disabled.');
    error.statusCode = 403;
    throw error;
  }

  const trimmedReason = String(reason || '').trim().slice(0, 180);

  await UserProgress.findOneAndUpdate(
    { userId, bookId },
    {
      $set: {
        meetFallbackGranted: true,
        meetFallbackGrantedAt: new Date(),
        meetFallbackReason: trimmedReason,
      },
    },
    { upsert: true, new: true },
  );

  return { ok: true };
};

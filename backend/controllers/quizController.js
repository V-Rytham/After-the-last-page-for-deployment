import mongoose from 'mongoose';
import { UserProgress } from '../models/UserProgress.js';
import { fetchBookQuizQuestions } from '../services/quizQuestionEngine.js';
import { resolveBookOrThrow } from '../services/accessService.js';
import { buildSafeErrorBody } from '../utils/runtime.js';

const PASS_THRESHOLD_PERCENT = Number.isFinite(Number(process.env.QUIZ_PASS_THRESHOLD_PERCENT))
  ? Math.max(0, Math.min(100, Number(process.env.QUIZ_PASS_THRESHOLD_PERCENT)))
  : 60;

const validateAnswers = (answers) => {
  if (!Array.isArray(answers) || answers.length !== 5) {
    const error = new Error('Exactly 5 answers are required.');
    error.statusCode = 400;
    throw error;
  }

  const normalized = answers.map((value) => Number.parseInt(value, 10));
  if (normalized.some((value) => !Number.isFinite(value) || value < 0 || value > 10)) {
    const error = new Error('Answers must be option indices.');
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

export const submitQuiz = async (req, res) => {
  try {
    const { userId, bookId, answers } = req.body || {};
    const effectiveUserId = req.user?._id;

    if (!effectiveUserId) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    if (userId && String(userId) !== String(effectiveUserId)) {
      return res.status(403).json({ message: 'User mismatch.' });
    }

    if (!bookId || !mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: 'Valid bookId is required.' });
    }

    await resolveBookOrThrow(bookId);

    const normalizedAnswers = validateAnswers(answers);

    let questions;
    try {
      questions = await fetchBookQuizQuestions(bookId);
    } catch (error) {
      if (error?.statusCode === 202 || error?.code === 'PROCESSING') {
        return res.status(409).json(buildSafeErrorBody(
          'Quiz is still being prepared. Please reload the quiz and try again.',
          error,
        ));
      }
      const status = error.statusCode || 502;
      return res.status(status).json(buildSafeErrorBody(
        'Quiz question engine is unavailable. Please retry.',
        error,
      ));
    }

    const correctCount = questions.reduce((total, question, index) => (
      total + (Number(normalizedAnswers[index]) === Number(question.correctIndex) ? 1 : 0)
    ), 0);

    const scorePercent = Math.round((correctCount / questions.length) * 100);
    const passed = scorePercent >= PASS_THRESHOLD_PERCENT;

    await UserProgress.findOneAndUpdate(
      { userId: effectiveUserId, bookId },
      {
        $set: {
          quizAttempted: true,
          quizPassed: passed,
          score: scorePercent,
          attemptedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    return res.json({ passed, score: scorePercent });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json(buildSafeErrorBody('Failed to submit quiz.', error));
  }
};

export const getQuizQuestions = async (req, res) => {
  try {
    const effectiveUserId = req.user?._id;
    const { bookId } = req.query || {};

    if (!effectiveUserId) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    if (!bookId || !mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: 'Valid bookId is required.' });
    }

    await resolveBookOrThrow(bookId);

    let questions;
    try {
      questions = await fetchBookQuizQuestions(bookId);
    } catch (error) {
      if (error?.statusCode === 202 || error?.code === 'PROCESSING') {
        return res.status(202).json({
          status: 'processing',
          message: 'Preparing your quiz. Please retry in a moment.',
        });
      }

      const status = error.statusCode || 502;
      return res.status(status).json(buildSafeErrorBody(
        'Quiz question engine is unavailable. Please retry.',
        error,
      ));
    }

    return res.json({
      questions: questions.map((q) => ({
        question: q.question,
        options: q.options,
      })),
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json(buildSafeErrorBody('Failed to fetch quiz questions.', error));
  }
};

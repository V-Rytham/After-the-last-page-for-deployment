import { checkMeetAccess, checkQuizAccess, grantMeetFallback } from '../services/accessService.js';
import mongoose from 'mongoose';
import { UserProgress } from '../models/UserProgress.js';
import { buildSafeErrorBody } from '../utils/runtime.js';

export const checkAccess = async (req, res) => {
  try {
    const bookId = String(req.query?.bookId || '').trim();
    if (!bookId) {
      return res.status(400).json({ message: 'bookId is required.' });
    }

    const context = String(req.query?.context || '').trim().toLowerCase();

    if (context === 'meet') {
      const result = await checkMeetAccess({ userId: req.user?._id, bookId });
      return res.json({ access: result.access, mode: result.mode });
    }

    const result = await checkQuizAccess({ userId: req.user?._id, bookId });
    return res.json({ access: result.access, mode: result.access ? 'quiz' : 'none' });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json(buildSafeErrorBody('Failed to check access.', error));
  }
};

export const requestMeetFallback = async (req, res) => {
  try {
    const bookId = String(req.body?.bookId || '').trim();
    if (!bookId) {
      return res.status(400).json({ message: 'bookId is required.' });
    }

    await grantMeetFallback({ userId: req.user?._id, bookId, reason: req.body?.reason });
    return res.json({ ok: true });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json(buildSafeErrorBody('Failed to grant fallback.', error));
  }
};

export const checkAccessBatch = async (req, res) => {
  try {
    const bookIds = Array.isArray(req.body?.bookIds) ? req.body.bookIds : [];
    if (!bookIds.length) {
      return res.status(400).json({ message: 'bookIds must be a non-empty array.' });
    }

    if (bookIds.length > 120) {
      return res.status(400).json({ message: 'Too many bookIds in one request.' });
    }

    const normalized = bookIds.map((id) => String(id || '').trim());
    if (normalized.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'One or more bookIds are invalid.' });
    }

    const records = await UserProgress.find({
      userId: req.user?._id,
      bookId: { $in: normalized },
      quizAttempted: true,
      quizPassed: true,
    }).select('bookId');

    const allowedBookIds = records.map((rec) => String(rec.bookId));
    return res.json({ allowedBookIds });
  } catch (error) {
    return res.status(500).json(buildSafeErrorBody('Failed to check access.', error));
  }
};

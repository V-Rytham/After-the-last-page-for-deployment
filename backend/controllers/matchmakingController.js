import mongoose from 'mongoose';
import { buildSafeErrorBody } from '../utils/runtime.js';
import { checkMeetAccess } from '../services/accessService.js';

export const createMatchmakingController = (sessionManager) => {
  if (!sessionManager) {
    throw new Error('sessionManager is required');
  }

  const join = async (req, res) => {
    try {
      const userId = req.user?._id;
      const { bookId, prefType } = req.body || {};

      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized.' });
      }

      if (!bookId || !mongoose.Types.ObjectId.isValid(bookId)) {
        return res.status(400).json({ message: 'Valid bookId is required.' });
      }

      const access = await checkMeetAccess({ userId, bookId });
      if (!access?.access) {
        return res.status(403).json({ message: 'Access is locked for this book.' });
      }

      const result = await sessionManager.joinMatchmaking({ userId, bookId, prefType });
      return res.json({ ...result, session: sessionManager.getSession(userId) });
    } catch (error) {
      const status = error.statusCode || 500;
      return res.status(status).json(buildSafeErrorBody('Failed to join matchmaking.', error));
    }
  };

  const leave = async (req, res) => {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized.' });
      }

      sessionManager.leaveMatchmaking({ userId });
      return res.json({ session: sessionManager.getSession(userId) });
    } catch (error) {
      return res.status(500).json(buildSafeErrorBody('Failed to leave matchmaking.', error));
    }
  };

  return { join, leave };
};


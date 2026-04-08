import { buildSafeErrorBody } from '../utils/runtime.js';
import { checkMeetAccess } from '../services/accessService.js';
import { getCanonicalBook } from '../services/canonicalBookService.js';

const MATCH_PREF_TYPES = new Set(['text', 'voice', 'video']);
const MAX_BOOK_ID_LEN = 140;

export const createMatchmakingController = (sessionManager) => {
  if (!sessionManager) {
    throw new Error('sessionManager is required');
  }

  const join = async (req, res) => {
    try {
      const userId = req.user?._id;
      const { source, source_book_id: sourceBookId, prefType } = req.body || {};

      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized.' });
      }

      if (req.user?.isAnonymous) {
        return res.status(403).json({ message: 'Please sign in to use Meet.' });
      }

      const normalizedSource = String(source || '').trim().toLowerCase();
      const normalizedSourceBookId = String(sourceBookId || '').trim();
      if (!normalizedSource || !normalizedSourceBookId || normalizedSourceBookId.length > MAX_BOOK_ID_LEN) {
        return res.status(400).json({ message: 'source and source_book_id are required.' });
      }

      const normalizedPrefType = String(prefType || 'text').trim().toLowerCase();
      if (!MATCH_PREF_TYPES.has(normalizedPrefType)) {
        return res.status(400).json({ message: 'Invalid prefType. Use text, voice, or video.' });
      }

      const access = await checkMeetAccess({ userId, source: normalizedSource, sourceBookId: normalizedSourceBookId });
      if (!access?.access) {
        return res.status(403).json({ message: access?.message || 'Live reading rooms are only available for open-access books.' });
      }

      const canonicalBook = await getCanonicalBook({ source: normalizedSource, source_book_id: normalizedSourceBookId });
      const canonicalBookId = String(canonicalBook?.canonical_book_id || '').trim();
      if (!canonicalBookId) {
        return res.status(422).json({ message: 'Unable to resolve canonical book identity.' });
      }

      const result = await sessionManager.joinMatchmaking({
        userId,
        bookId: canonicalBookId,
        prefType: normalizedPrefType,
      });

      return res.json({
        ...result,
        room_id: canonicalBookId,
        canonical_book_id: canonicalBookId,
        book: {
          canonical_book_id: canonicalBookId,
          title: canonicalBook?.title || 'Untitled',
          author: canonicalBook?.author || '',
          source: normalizedSource,
          source_book_id: normalizedSourceBookId,
        },
        session: sessionManager.getPublicSession(userId),
      });
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

      if (req.user?.isAnonymous) {
        return res.status(403).json({ message: 'Please sign in to use Meet.' });
      }

      sessionManager.leaveMatchmaking({ userId });
      return res.json({ session: sessionManager.getPublicSession(userId) });
    } catch (error) {
      return res.status(500).json(buildSafeErrorBody('Failed to leave matchmaking.', error));
    }
  };

  return { join, leave };
};

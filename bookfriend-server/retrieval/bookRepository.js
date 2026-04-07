import mongoose from 'mongoose';
import { Book } from '../models/Book.js';

const parseBookId = (bookId) => {
  const raw = String(bookId || '').trim();
  const composite = raw.match(/^([a-z0-9_-]+):(.+)$/i);
  if (composite) {
    const [, sourceRaw, sourceIdRaw] = composite;
    const source = String(sourceRaw || '').trim().toLowerCase();
    const sourceId = String(sourceIdRaw || '').trim();
    if (source === 'gutenberg' && /^\d+$/.test(sourceId)) {
      return { gutenbergId: Number.parseInt(sourceId, 10) };
    }
  }

  const goodMatch = raw.match(/^g?(\d+)$/i);
  if (goodMatch) {
    return { gutenbergId: Number.parseInt(goodMatch[1], 10) };
  }

  if (mongoose.Types.ObjectId.isValid(raw)) {
    return { _id: raw };
  }

  return null;
};

export const findBookForAgent = async (bookId) => {
  const query = parseBookId(bookId);
  if (!query) {
    return null;
  }

  return Book.findOne(query)
    .select('title author synopsis tags chapters gutenbergId')
    .lean();
};

import mongoose from 'mongoose';
import { badRequest } from './httpErrors.js';

const OBJECT_ID_HEX_RE = /^[a-fA-F0-9]{24}$/;

export const parseObjectId = (value, label) => {
  const raw = String(value || '').trim();
  if (!OBJECT_ID_HEX_RE.test(raw)) {
    throw badRequest(`Invalid ${label}.`);
  }
  return new mongoose.Types.ObjectId(raw);
};

export const parsePagination = (query, { defaultLimit = 25, maxLimit = 50 } = {}) => {
  const pageRaw = Number.parseInt(String(query?.page ?? '1'), 10);
  const limitRaw = Number.parseInt(String(query?.limit ?? String(defaultLimit)), 10);

  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.min(10_000, pageRaw)) : 1;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(maxLimit, limitRaw)) : defaultLimit;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const sanitizeText = (value, maxLen) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLen);

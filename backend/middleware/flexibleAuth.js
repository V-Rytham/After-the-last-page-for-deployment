import jwt from 'jsonwebtoken';
import { buildSafeErrorBody } from '../utils/runtime.js';

const extractBearer = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (raw.toLowerCase().startsWith('bearer ')) {
    return raw.slice(7).trim();
  }
  return raw;
};

export const protectFlexible = (req, res, next) => {
  try {
    const headerToken = extractBearer(req.headers?.authorization);
    const bodyToken = extractBearer(req.body?.token);
    const queryToken = extractBearer(req.query?.token);

    const token = headerToken || bodyToken || queryToken;
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.id || decoded?._id || null;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    req.user = { _id: userId };
    return next();
  } catch (error) {
    return res.status(401).json(buildSafeErrorBody('Unauthorized.', error));
  }
};


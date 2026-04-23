import { buildSafeErrorBody } from '../utils/runtime.js';

const toCleanString = (value, max = 80) => String(value || '').trim().slice(0, max);

export const protectFlexible = (req, res, next) => {
  try {
    const userId = toCleanString(req.headers['x-user-id']) || toCleanString(req.body?.userId) || toCleanString(req.query?.userId);
    const displayName = toCleanString(req.headers['x-display-name'], 60)
      || toCleanString(req.body?.displayName, 60)
      || toCleanString(req.query?.displayName, 60)
      || 'Reader';

    if (!userId) {
      return res.status(401).json({ message: 'userId is required.' });
    }

    req.user = { _id: userId, displayName };
    req.identity = { userId, displayName };
    return next();
  } catch (error) {
    return res.status(401).json(buildSafeErrorBody('Unauthorized.', error));
  }
};

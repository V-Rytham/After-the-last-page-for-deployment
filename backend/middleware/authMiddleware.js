import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { isProd } from '../utils/runtime.js';
import { isDegradedMode } from '../utils/degradedMode.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const tokenUserId = decoded?.id || decoded?._id;

      if (isDegradedMode()) {
        req.user = tokenUserId
          ? {
            _id: tokenUserId,
            anonymousId: decoded?.anonymousId || '',
            isAnonymous: Boolean(decoded?.isAnonymous),
          }
          : null;
      } else {
        req.user = await User.findById(tokenUserId).select('-password');
      }

      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      next();
      return;
    } catch (error) {
      if (!isProd()) {
        console.error('[AUTH] Token verification failed:', error);
      } else {
        console.error('[AUTH] Token verification failed:', error?.message || 'unknown error');
      }
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  res.status(401).json({ message: 'Not authorized, no token' });
};

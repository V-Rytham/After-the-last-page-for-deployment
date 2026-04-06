import jwt from 'jsonwebtoken';

const buildClaims = (id, extraClaims = {}) => {
  const base = { id };
  const next = { ...base };

  if (Object.prototype.hasOwnProperty.call(extraClaims, 'isAnonymous')) {
    next.isAnonymous = Boolean(extraClaims.isAnonymous);
  }

  if (Object.prototype.hasOwnProperty.call(extraClaims, 'anonymousId')) {
    next.anonymousId = String(extraClaims.anonymousId || '');
  }

  return next;
};

export const issueAuthToken = (id, extraClaims = {}) => jwt.sign(buildClaims(id, extraClaims), process.env.JWT_SECRET, {
  expiresIn: '7d',
});

// Backward compatibility.
export const generateToken = issueAuthToken;

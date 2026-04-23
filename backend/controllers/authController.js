import { User } from '../models/User.js';
import { issueAuthToken } from '../utils/generateToken.js';
import { AUTH_COOKIE_NAME, clearAuthCookieOptions, getAuthCookieOptions } from '../utils/authCookies.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const sanitizeAuthUser = (user) => ({
  _id: user._id,
  anonymousId: user.anonymousId,
  name: user.name || '',
  username: user.username || '',
  email: user.email || '',
  isAnonymous: Boolean(user.isAnonymous),
  isVerified: Boolean(user.isVerified),
  provider: user.provider || 'local',
  preferredGenres: Array.isArray(user.preferredGenres) ? user.preferredGenres : [],
  hasPersonalization: Boolean(user.hasPersonalization),
  createdAt: user.createdAt,
});

const isValidPassword = (password) => {
  const value = String(password || '');
  return value.length >= 6;
};

const issueCookie = (res, token) => {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
};

const generateAnonymousId = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `Reader #${Math.floor(1000 + Math.random() * 9000)}`;
    const existing = await User.findOne({ anonymousId: candidate }).select('_id');
    if (!existing) {
      return candidate;
    }
  }

  return `Reader #${Date.now().toString().slice(-6)}`;
};

export const signup = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !isValidPassword(password)) {
    return res.status(400).json({ message: 'A valid email and password are required (password min 6 chars).' });
  }

  let user = await User.findOne({ email });

  if (user && user.provider === 'google') {
    return res.status(400).json({ message: 'This email is linked to Google login.' });
  }

  if (user?.isVerified) {
    return res.status(409).json({ message: 'An account with that email already exists.' });
  }

  if (!user) {
    user = await User.create({
      anonymousId: await generateAnonymousId(),
      email,
      password,
      isAnonymous: false,
      provider: 'local',
      isVerified: true,
      name: '',
      username: '',
      bio: '',
      rating: 5,
      preferences: {
        theme: 'dark',
        defaultMatchMedium: 'text',
      },
    });
  } else {
    user.password = password;
    user.provider = 'local';
    user.isVerified = true;
    user.otpHash = '';
    user.otpExpiry = undefined;
    user.otpAttempts = 0;
    await user.save();
  }

  const token = issueAuthToken(user._id, { isAnonymous: user.isAnonymous, anonymousId: user.anonymousId });
  issueCookie(res, token);
  return res.status(200).json({ token, user: sanitizeAuthUser(user) });
};

export const verifyOtp = async (req, res) => {
  return res.status(410).json({ message: 'OTP verification is disabled.' });
};

export const login = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = await User.findOne({ email });
  if (!user || user.isAnonymous || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = issueAuthToken(user._id, { isAnonymous: user.isAnonymous, anonymousId: user.anonymousId });
  issueCookie(res, token);

  return res.status(200).json({ token, user: sanitizeAuthUser(user) });
};

export const googleCallbackSuccess = async (req, res) => {
  const callbackUrl = String(process.env.CLIENT_URL || req.get('origin') || '').trim().replace(/\/$/, '');
  if (!callbackUrl) {
    return res.status(500).json({ message: 'CLIENT_URL is not configured for Google auth callback.' });
  }
  return res.redirect(`${callbackUrl}/#/auth?error=google_login_failed`);
};

export const googleAuthFailure = async (_req, res) => {
  const callbackUrl = String(process.env.CLIENT_URL || '').trim().replace(/\/$/, '');
  if (!callbackUrl) {
    return res.status(500).json({ message: 'CLIENT_URL is not configured for Google auth callback.' });
  }
  return res.redirect(`${callbackUrl}/#/auth?error=google_login_failed`);
};

export const logout = async (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions());
  return res.status(200).json({ message: 'Logged out' });
};

export const me = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  return res.status(200).json(sanitizeAuthUser(req.user));
};

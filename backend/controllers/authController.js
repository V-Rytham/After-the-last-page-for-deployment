import { User } from '../models/User.js';
import { issueAuthToken } from '../utils/generateToken.js';
import { AUTH_COOKIE_NAME, clearAuthCookieOptions, getAuthCookieOptions } from '../utils/authCookies.js';
import { generateOtpCode, hashOtp, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from '../utils/otp.js';
import { sendOtpEmail } from '../services/emailService.js';

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

  const now = Date.now();
  let user = await User.findOne({ email });

  if (user && user.provider === 'google') {
    return res.status(400).json({ message: 'This email is linked to Google login.' });
  }

  if (user?.isVerified) {
    return res.status(409).json({ message: 'An account with that email already exists.' });
  }

  if (user?.otpLastSentAt && (now - new Date(user.otpLastSentAt).getTime()) < OTP_RESEND_COOLDOWN_MS) {
    return res.status(429).json({ message: 'Please wait before requesting another OTP.' });
  }

  const otp = generateOtpCode();
  const otpHash = hashOtp(otp);
  const otpExpiry = new Date(now + OTP_TTL_MS);

  if (!user) {
    user = await User.create({
      anonymousId: await generateAnonymousId(),
      email,
      password,
      isAnonymous: false,
      provider: 'local',
      isVerified: false,
      otpHash,
      otpExpiry,
      otpAttempts: 0,
      otpLastSentAt: new Date(now),
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
    user.isVerified = false;
    user.otpHash = otpHash;
    user.otpExpiry = otpExpiry;
    user.otpAttempts = 0;
    user.otpLastSentAt = new Date(now);
    await user.save();
  }

  await sendOtpEmail(email, otp);

  return res.status(200).json({ message: 'OTP sent' });
};

export const verifyOtp = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = String(req.body?.otp || '').trim();

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  const user = await User.findOne({ email });
  if (!user || user.provider !== 'local') {
    return res.status(401).json({ message: 'Invalid OTP.' });
  }

  if (!user.otpHash || !user.otpExpiry) {
    return res.status(400).json({ message: 'No OTP request found. Please sign up again.' });
  }

  if ((user.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ message: 'Maximum OTP attempts reached. Request a new OTP.' });
  }

  if (new Date(user.otpExpiry).getTime() < Date.now()) {
    return res.status(400).json({ message: 'OTP expired. Request a new OTP.' });
  }

  const providedHash = hashOtp(otp);
  if (providedHash !== user.otpHash) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    await user.save();
    return res.status(401).json({ message: 'Invalid OTP.' });
  }

  user.isVerified = true;
  user.otpHash = '';
  user.otpExpiry = undefined;
  user.otpAttempts = 0;
  await user.save();

  const token = issueAuthToken(user._id, { isAnonymous: user.isAnonymous, anonymousId: user.anonymousId });
  issueCookie(res, token);

  return res.status(200).json({ token, user: sanitizeAuthUser(user) });
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

  if (!user.isVerified) {
    return res.status(403).json({ message: 'Please verify your email before logging in.' });
  }

  const token = issueAuthToken(user._id, { isAnonymous: user.isAnonymous, anonymousId: user.anonymousId });
  issueCookie(res, token);

  return res.status(200).json({ token, user: sanitizeAuthUser(user) });
};

export const googleCallbackSuccess = async (req, res) => {
  const callbackUrl = String(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const token = req.user?.token;
  if (!token) {
    return res.redirect(`${callbackUrl}/#/auth?error=google_login_failed`);
  }

  issueCookie(res, token);
  return res.redirect(`${callbackUrl}/#/auth?google=success`);
};

export const googleAuthFailure = async (_req, res) => {
  const callbackUrl = String(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
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

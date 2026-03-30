import { User } from '../models/User.js';
import { Thread } from '../models/Thread.js';
import { UserProgress } from '../models/UserProgress.js';
import { generateToken } from '../utils/generateToken.js';
import { buildSafeErrorBody } from '../utils/runtime.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const formatUsername = (value) => String(value || '').trim();
const normalizeUsername = (value) => formatUsername(value).toLowerCase();
const sanitizeBio = (value) => String(value || '').trim();
const sanitizeName = (value) => String(value || '').trim();

const validateUsername = (username) => {
  const formatted = formatUsername(username);

  if (!formatted) {
    return { ok: false, message: 'Username is required.' };
  }

  if (!USERNAME_RE.test(formatted)) {
    return { ok: false, message: 'Username must be 3-20 characters using letters, numbers, or underscores.' };
  }

  return { ok: true, username: formatted, usernameLower: normalizeUsername(formatted) };
};

const countRepliesByAuthor = (comments = [], authorAnonId) => comments.reduce((total, comment) => {
  if (!comment) {
    return total;
  }

  const matchesAuthor = String(comment.authorAnonId || '') === String(authorAnonId || '');
  return total + (matchesAuthor ? 1 : 0) + countRepliesByAuthor(comment.replies || [], authorAnonId);
}, 0);

const buildProfileStats = async (user) => {
  if (!user?._id) {
    return {
      booksCompleted: 0,
      discussionsParticipated: 0,
    };
  }

  const [booksCompleted, relatedThreads] = await Promise.all([
    UserProgress.countDocuments({ userId: user._id, quizPassed: true }),
    Thread.find({
      $or: [
        { authorAnonId: user.anonymousId },
        { 'comments.authorAnonId': user.anonymousId },
        { 'comments.replies.authorAnonId': user.anonymousId },
      ],
    }).select('comments authorAnonId'),
  ]);

  const participatedThreadIds = new Set();

  relatedThreads.forEach((thread) => {
    if (
      String(thread.authorAnonId || '') === String(user.anonymousId || '')
      || countRepliesByAuthor(thread.comments || [], user.anonymousId) > 0
    ) {
      participatedThreadIds.add(String(thread._id));
    }
  });

  return {
    booksCompleted,
    discussionsParticipated: participatedThreadIds.size,
  };
};

const buildUserResponse = (user, extra = {}) => ({
  _id: user._id,
  anonymousId: user.anonymousId,
  name: user.name || '',
  username: user.username || '',
  bio: user.bio || '',
  email: user.email || '',
  isAnonymous: Boolean(user.isAnonymous),
  rating: user.rating,
  joinedAt: user.createdAt,
  preferences: user.preferences,
  stats: extra.stats || {
    booksCompleted: 0,
    discussionsParticipated: 0,
  },
  token: generateToken(user._id),
});

const buildProfileResponse = async (user) => ({
  _id: user._id,
  anonymousId: user.anonymousId,
  name: user.name || '',
  username: user.username || '',
  bio: user.bio || '',
  email: user.email || '',
  isAnonymous: Boolean(user.isAnonymous),
  rating: user.rating,
  joinedAt: user.createdAt,
  preferences: user.preferences,
  stats: await buildProfileStats(user),
});

const generateAnonymousId = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const anonymousId = `Reader #${randomSuffix}`;
    const existingUser = await User.findOne({ anonymousId });
    if (!existingUser) {
      return anonymousId;
    }
  }

  return `Reader #${Date.now().toString().slice(-6)}`;
};

export const registerAnonymousUser = async (req, res) => {
  try {
    const anonymousId = await generateAnonymousId();

    const user = await User.create({
      anonymousId,
      isAnonymous: true,
      rating: 5.0,
      preferences: {
        theme: 'dark',
        defaultMatchMedium: 'text',
      },
    });

    res.status(201).json(buildUserResponse(user));
  } catch (error) {
    res.status(500).json(buildSafeErrorBody('Server error', error));
  }
};

export const registerUser = async (req, res) => {
  try {
    const { name, username, bio, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: 'Name, username, email, and password are required.' });
    }

    const trimmedName = sanitizeName(name);
    if (!trimmedName) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    const usernameCheck = validateUsername(username);
    if (!usernameCheck.ok) {
      return res.status(400).json({ message: usernameCheck.message });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const sanitizedBiography = sanitizeBio(bio);
    if (sanitizedBiography.length > 160) {
      return res.status(400).json({ message: 'Bio must be 160 characters or fewer.' });
    }

    const [existingUser, existingUsername] = await Promise.all([
      User.findOne({ email: normalizedEmail }),
      User.findOne({ usernameLower: usernameCheck.usernameLower }),
    ]);

    if (existingUser) {
      return res.status(400).json({ message: 'An account with that email already exists.' });
    }

    if (existingUsername) {
      return res.status(400).json({ message: 'That username is already taken.' });
    }

    const anonymousId = await generateAnonymousId();
    const user = await User.create({
      anonymousId,
      name: trimmedName,
      username: usernameCheck.username,
      bio: sanitizedBiography,
      email: normalizedEmail,
      password,
      isAnonymous: false,
      rating: 5.0,
      preferences: {
        theme: 'dark',
        defaultMatchMedium: 'text',
      },
    });

    res.status(201).json(buildUserResponse(user));
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.usernameLower) {
      return res.status(400).json({ message: 'That username is already taken.' });
    }

    res.status(500).json(buildSafeErrorBody('Server error', error));
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || user.isAnonymous || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    res.json(buildUserResponse(user));
  } catch (error) {
    res.status(500).json(buildSafeErrorBody('Server error', error));
  }
};

export const getUserProfile = async (req, res) => {
  try {
    if (req.user) {
      res.json(await buildProfileResponse(req.user));
      return;
    }

    res.status(404).json({ message: 'User not found' });
  } catch (error) {
    res.status(500).json(buildSafeErrorBody('Server error', error));
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    if (!req.user || req.user.isAnonymous) {
      return res.status(403).json({ message: 'Only members can edit a profile.' });
    }

    const nextName = sanitizeName(req.body?.name);
    const nextBio = sanitizeBio(req.body?.bio);
    const usernameCheck = validateUsername(req.body?.username);

    if (!nextName) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    if (!usernameCheck.ok) {
      return res.status(400).json({ message: usernameCheck.message });
    }

    if (nextBio.length > 160) {
      return res.status(400).json({ message: 'Bio must be 160 characters or fewer.' });
    }

    const duplicate = await User.findOne({
      usernameLower: usernameCheck.usernameLower,
      _id: { $ne: req.user._id },
    }).select('_id');

    if (duplicate) {
      return res.status(400).json({ message: 'That username is already taken.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.name = nextName;
    user.username = usernameCheck.username;
    user.bio = nextBio;

    await user.save();

    res.json(await buildProfileResponse(user));
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.usernameLower) {
      return res.status(400).json({ message: 'That username is already taken.' });
    }

    res.status(500).json(buildSafeErrorBody('Server error', error));
  }
};

export const checkUsernameAvailability = async (req, res) => {
  try {
    const requestedUsername = req.query?.username;

    if (!requestedUsername) {
      return res.status(400).json({ message: 'Username is required.' });
    }

    const usernameCheck = validateUsername(requestedUsername);
    if (!usernameCheck.ok) {
      return res.status(400).json({ message: usernameCheck.message, available: false });
    }

    const existingUser = await User.findOne({ usernameLower: usernameCheck.usernameLower }).select('_id');
    res.json({
      available: !existingUser,
      username: usernameCheck.username,
      message: existingUser ? 'That username is already taken.' : 'Username is available.',
    });
  } catch (error) {
    res.status(500).json(buildSafeErrorBody('Server error', error));
  }
};

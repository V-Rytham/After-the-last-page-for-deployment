import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const userSchema = new mongoose.Schema({
  anonymousId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    trim: true,
  },
  username: {
    type: String,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: USERNAME_RE,
    sparse: true,
  },
  usernameLower: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 160,
    default: '',
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  otpHash: {
    type: String,
    default: '',
  },
  otpExpiry: {
    type: Date,
  },
  otpAttempts: {
    type: Number,
    default: 0,
  },
  otpLastSentAt: {
    type: Date,
  },
  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local',
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  rating: {
    type: Number,
    default: 5.0,
    min: 0,
    max: 5,
  },
  preferences: {
    theme: { type: String, default: 'dark' },
    defaultMatchMedium: { type: String, enum: ['text', 'voice', 'video'], default: 'text' },
  },
  profileImageUrl: {
    type: String,
    trim: true,
    default: '',
  },
  profileImagePath: {
    type: String,
    trim: true,
    default: '',
  },
  preferredGenres: {
    type: [String],
    default: [],
  },
  hasPersonalization: {
    type: Boolean,
    default: false,
  },
  recommendedBooks: {
    type: [{
      title: { type: String, required: true, trim: true },
      author: { type: String, required: true, trim: true },
      gutenbergId: { type: Number, default: null },
      source: { type: String, default: 'gutenberg', trim: true },
      sourceId: { type: String, default: '', trim: true },
      genres: { type: [String], default: [] },
    }],
    default: [],
  },
  recommendationsGeneratedAt: {
    type: Date,
  },
}, { timestamps: true });

userSchema.pre('save', async function save() {
  if (this.isModified('username')) {
    this.usernameLower = this.username ? String(this.username).trim().toLowerCase() : undefined;
  }

  if (!this.isModified('password') || !this.password) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function matchPassword(enteredPassword) {
  if (!this.password) {
    return false;
  }

  return bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model('User', userSchema);

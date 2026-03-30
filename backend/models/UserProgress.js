import mongoose from 'mongoose';

const userProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
      index: true,
    },
    quizAttempted: {
      type: Boolean,
      default: false,
    },
    quizPassed: {
      type: Boolean,
      default: false,
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    attemptedAt: {
      type: Date,
      default: null,
    },
    meetFallbackGranted: {
      type: Boolean,
      default: false,
    },
    meetFallbackGrantedAt: {
      type: Date,
      default: null,
    },
    meetFallbackReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 180,
    },
  },
  { timestamps: true },
);

userProgressSchema.index({ userId: 1, bookId: 1 }, { unique: true });

export const UserProgress = mongoose.model('UserProgress', userProgressSchema);

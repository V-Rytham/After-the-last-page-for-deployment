import mongoose from 'mongoose';
import { normalizeTags } from '../utils/tags.js';

const chapterSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    title: { type: String, required: true },
    html: { type: String, required: true },
    wordCount: { type: Number, default: 0 },
  },
  { _id: false },
);


const processingStatusSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      enum: ['ready', 'processing', 'failed', 'not_started'],
      default: 'not_started',
      index: true,
    },
    lastProcessedAt: Date,
    errorMessage: String,
  },
  { _id: false },
);

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  isbn: String,
  coverImage: String,
  coverColor: String,
  synopsis: String,
  minReadHours: { type: Number, default: 2 },
  tags: [String],
  // Optional series metadata (backward compatible).
  // If present, enables "next in series" recommendations.
  series: String,
  seriesIndex: Number,
  contentMockUrl: String, // Legacy (simulated reader text)

  gutenbergId: {
    type: Number,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: (value) => Number.isInteger(value) && value > 0,
      message: 'gutenbergId must be a positive integer.',
    },
  },
  sourceProvider: { type: String, default: 'Project Gutenberg' },
  sourceUrl: String,
  rights: { type: String, default: 'Public domain (Project Gutenberg)' },

  textContent: String,
  chapters: [chapterSchema],
  processingStatus: {
    type: processingStatusSchema,
    default: () => ({ state: 'not_started' }),
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'failed'],
    required: true,
    default: 'pending',
    index: true,
  },
  retryCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  processingStartedAt: Date,
  lastIngestionAttemptAt: Date,
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  requestedAt: Date,
  ingestionError: String,
});

bookSchema.index({ title: 1 });

bookSchema.pre('save', async function () {
  if (this.isModified('tags')) {
    this.tags = normalizeTags(this.tags || []);
  }

  if (!this.processingStatus || typeof this.processingStatus !== 'object') {
    this.processingStatus = { state: 'not_started' };
  }

  if (this.isModified('status') || !this.processingStatus?.state) {
    const statusStateMap = {
      pending: 'not_started',
      processing: 'processing',
      ready: 'ready',
      failed: 'failed',
    };

    this.processingStatus.state = statusStateMap[this.status] || this.processingStatus.state || 'not_started';
  }

  if (this.status === 'ready') {
    this.processingStatus.lastProcessedAt = new Date();
    this.processingStatus.errorMessage = undefined;
  }

  if (this.status === 'failed' && this.ingestionError) {
    this.processingStatus.errorMessage = this.ingestionError;
  }
});

export const Book = mongoose.model('Book', bookSchema);

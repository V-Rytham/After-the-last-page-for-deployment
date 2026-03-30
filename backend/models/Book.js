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

  gutenbergId: Number,
  sourceProvider: { type: String, default: 'Project Gutenberg' },
  sourceUrl: String,
  rights: { type: String, default: 'Public domain (Project Gutenberg)' },

  textContent: String,
  chapters: [chapterSchema],
  status: {
    type: String,
    enum: ['pending', 'ready', 'failed'],
    default: 'ready',
    index: true,
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  requestedAt: Date,
  ingestionError: String,
});

bookSchema.index({ gutenbergId: 1 }, { unique: true, sparse: true });
bookSchema.index({ title: 1 });

bookSchema.pre('save', async function () {
  if (this.isModified('tags')) {
    this.tags = normalizeTags(this.tags || []);
  }
});

export const Book = mongoose.model('Book', bookSchema);

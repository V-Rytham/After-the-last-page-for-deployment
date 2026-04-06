import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  authorAnonId: String,
  content: { type: String, required: true },
  likes: { type: Number, default: 0 },
  likedBy: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

commentSchema.add({
  replies: [commentSchema],
});

const threadSchema = new mongoose.Schema({
  // New universal key for any book source:
  // - Mongo book id: "507f1f77bcf86cd799439011"
  // - Composite book id: "gutenberg:1342" | "openlibrary:OL123M" | "googlebooks:xyz"
  // - Manual meet/thread: "custom:atomic habits"
  bookKey: {
    type: String,
    required: true,
    index: true,
    maxlength: 180,
  },
  // Legacy: kept for backwards-compat with existing data.
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: false,
  },
  authorAnonId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
    maxLength: 100,
  },
  chapterReference: {
    type: String,
    maxLength: 80,
  },
  content: {
    type: String,
    required: true,
  },
  likes: {
    type: Number,
    default: 0,
  },
  likedBy: { type: [String], default: [] },
  comments: [commentSchema],
}, { timestamps: true });

threadSchema.pre('validate', function ensureBookKey(next) {
  if (!this.bookKey && this.bookId) {
    this.bookKey = String(this.bookId);
  }
  next();
});

threadSchema.index({ bookKey: 1, updatedAt: -1 });
threadSchema.index({ bookKey: 1, likes: -1, updatedAt: -1 });
threadSchema.index({ bookId: 1, updatedAt: -1 });
threadSchema.index({ bookId: 1, likes: -1, updatedAt: -1 });

export const Thread = mongoose.model('Thread', threadSchema);

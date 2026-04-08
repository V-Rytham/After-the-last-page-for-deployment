import mongoose from 'mongoose';

const bookSourceSchema = new mongoose.Schema(
  {
    canonical_book_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    source: { type: String, required: true, trim: true, lowercase: true },
    source_book_id: { type: String, required: true, trim: true },
    raw_metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

bookSourceSchema.index({ source: 1, source_book_id: 1 }, { unique: true });
bookSourceSchema.index({ canonical_book_id: 1, source: 1 });

export const BookSource = mongoose.model('BookSource', bookSourceSchema, 'book_sources');

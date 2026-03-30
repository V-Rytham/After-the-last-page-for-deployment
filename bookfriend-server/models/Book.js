import mongoose from 'mongoose';

const chapterSchema = new mongoose.Schema(
  {
    index: Number,
    title: String,
    html: String,
  },
  { _id: false },
);

const bookSchema = new mongoose.Schema(
  {
    title: String,
    author: String,
    synopsis: String,
    tags: [String],
    chapters: [chapterSchema],
    gutenbergId: Number,
  },
  { collection: 'books' },
);

export const Book = mongoose.models.Book || mongoose.model('Book', bookSchema);

import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  gutenbergId: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
});

bookSchema.index({ title: 1 });

export const Book = mongoose.model('Book', bookSchema);

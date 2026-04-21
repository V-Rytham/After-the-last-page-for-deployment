import mongoose from 'mongoose';

const { Schema } = mongoose;

const bookThreadSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    chapterReference: { type: String, trim: true, maxlength: 80, default: '' },
    rootMessageId: { type: Schema.Types.ObjectId, ref: 'BookThreadMessage', default: null, index: true },
    messageCount: { type: Number, default: 0, min: 0 },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    likes: { type: Number, default: 0, min: 0 },
    likedBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

bookThreadSchema.index({ bookId: 1, lastMessageAt: -1, _id: -1 });
bookThreadSchema.index({ userId: 1, updatedAt: -1, _id: -1 });

export const BookThread = mongoose.model('BookThread', bookThreadSchema);


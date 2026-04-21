import mongoose from 'mongoose';

const { Schema } = mongoose;

const bookThreadMessageSchema = new Schema(
  {
    threadId: { type: Schema.Types.ObjectId, ref: 'BookThread', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 3000 },
    parentMessageId: { type: Schema.Types.ObjectId, ref: 'BookThreadMessage', default: null, index: true },
    likes: { type: Number, default: 0, min: 0 },
    likedBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

bookThreadMessageSchema.index({ threadId: 1, createdAt: 1, _id: 1 });
bookThreadMessageSchema.index({ threadId: 1, parentMessageId: 1, createdAt: 1, _id: 1 });

export const BookThreadMessage = mongoose.model('BookThreadMessage', bookThreadMessageSchema);


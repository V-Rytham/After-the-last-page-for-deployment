import mongoose from 'mongoose';
import { BookThread } from '../../models/BookThread.js';
import { BookThreadMessage } from '../../models/BookThreadMessage.js';
import { badRequest, notFound } from './httpErrors.js';
import { parsePagination, sanitizeText } from './validators.js';

const deriveAuthorLabel = (user) => {
  const preferred = String(user?.anonymousId || '').trim();
  if (preferred) return preferred;

  const username = String(user?.username || '').trim();
  if (username) return username;

  const name = String(user?.name || '').trim();
  if (name) return name;

  const id = user?._id ? String(user._id) : '';
  if (id) return `Reader ${id.slice(-6)}`;

  return 'Anonymous Reader';
};

const deriveUsername = (user) => {
  if (!user || typeof user !== 'object') return '';
  if (user?.isAnonymous) return '';
  return String(user?.username || '').trim();
};

const normalizeId = (value) => (value ? String(value) : '');

const toThreadListItem = ({ thread, rootMessage }) => ({
  id: normalizeId(thread._id),
  _id: normalizeId(thread._id),
  bookId: normalizeId(thread.bookId),
  userId: normalizeId(thread.userId?._id || thread.userId),
  authorAnonId: deriveAuthorLabel(thread.userId),
  authorUsername: deriveUsername(thread.userId),
  title: thread.title,
  chapterReference: thread.chapterReference || '',
  content: rootMessage?.content || '',
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
  lastMessageAt: thread.lastMessageAt,
  messageCount: Number(thread.messageCount || 0),
  likes: Number(thread.likes || 0),
  likedBy: Array.isArray(thread.likedBy) ? thread.likedBy.map(normalizeId) : [],
  rootMessageId: normalizeId(thread.rootMessageId),
});

const toThreadDetail = ({ thread, rootMessage }) => ({
  ...toThreadListItem({ thread, rootMessage }),
});

const toMessageDto = (message) => ({
  id: normalizeId(message._id),
  _id: normalizeId(message._id),
  threadId: normalizeId(message.threadId),
  userId: normalizeId(message.userId?._id || message.userId),
  authorAnonId: deriveAuthorLabel(message.userId),
  authorUsername: deriveUsername(message.userId),
  content: message.content,
  parentMessageId: normalizeId(message.parentMessageId),
  createdAt: message.createdAt,
  likes: Number(message.likes || 0),
  likedBy: Array.isArray(message.likedBy) ? message.likedBy.map(normalizeId) : [],
});

const isStandaloneTransactionError = (error) => {
  const message = String(error?.message || error?.cause?.message || '').toLowerCase();
  return message.includes('transaction numbers are only allowed') || message.includes('replica set member or mongos');
};

export class BookThreadsService {
  async createThread({ bookId, userId, title, content, chapterReference }) {
    const sanitizedTitle = sanitizeText(title, 100);
    const sanitizedContent = sanitizeText(content, 3000);
    const sanitizedReference = sanitizeText(chapterReference, 80);

    if (!sanitizedTitle || sanitizedTitle.length < 3) {
      throw badRequest('Thread title must be at least 3 characters.');
    }

    if (!sanitizedContent) {
      throw badRequest('Thread content is required.');
    }

    const createThreadWithoutTransaction = async () => {
      const createdThread = await BookThread.create({
        bookId,
        userId,
        title: sanitizedTitle,
        chapterReference: sanitizedReference,
        rootMessageId: null,
        messageCount: 0,
        lastMessageAt: new Date(),
        likes: 0,
        likedBy: [],
      });

      let createdRoot;
      try {
        createdRoot = await BookThreadMessage.create({
          threadId: createdThread._id,
          userId,
          content: sanitizedContent,
          parentMessageId: null,
          likes: 0,
          likedBy: [],
        });
      } catch (error) {
        await BookThread.deleteOne({ _id: createdThread._id });
        throw error;
      }

      createdThread.rootMessageId = createdRoot._id;
      createdThread.messageCount = 1;
      createdThread.lastMessageAt = createdRoot.createdAt;
      await createdThread.save();

      const hydratedThread = await BookThread.findById(createdThread._id)
        .populate('userId', 'anonymousId username name isAnonymous')
        .lean();
      const rootMessage = await BookThreadMessage.findById(createdRoot._id).lean();

      return toThreadDetail({ thread: hydratedThread, rootMessage });
    };

    const session = await mongoose.startSession();
    try {
      let createdThread;
      let createdRoot;

      try {
        await session.withTransaction(async () => {
          createdThread = await BookThread.create([{
            bookId,
            userId,
            title: sanitizedTitle,
            chapterReference: sanitizedReference,
            rootMessageId: null,
            messageCount: 0,
            lastMessageAt: new Date(),
            likes: 0,
            likedBy: [],
          }], { session }).then((docs) => docs[0]);

          createdRoot = await BookThreadMessage.create([{
            threadId: createdThread._id,
            userId,
            content: sanitizedContent,
            parentMessageId: null,
            likes: 0,
            likedBy: [],
          }], { session }).then((docs) => docs[0]);

          createdThread.rootMessageId = createdRoot._id;
          createdThread.messageCount = 1;
          createdThread.lastMessageAt = createdRoot.createdAt;
          await createdThread.save({ session });
        });
      } catch (error) {
        if (isStandaloneTransactionError(error)) {
          return await createThreadWithoutTransaction();
        }
        throw error;
      }

      const hydratedThread = await BookThread.findById(createdThread._id)
        .populate('userId', 'anonymousId username name')
        .lean();
      const rootMessage = await BookThreadMessage.findById(createdRoot._id).lean();

      return toThreadDetail({ thread: hydratedThread, rootMessage });
    } finally {
      session.endSession();
    }
  }

  async listThreadsByBook({ bookId, query }) {
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 25, maxLimit: 50 });

    const [threads, total] = await Promise.all([
      BookThread.find({ bookId })
        .sort({ lastMessageAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'anonymousId username name isAnonymous')
        .lean(),
      BookThread.countDocuments({ bookId }),
    ]);

    const rootIds = threads.map((thread) => thread.rootMessageId).filter(Boolean);
    const roots = rootIds.length
      ? await BookThreadMessage.find({ _id: { $in: rootIds } }).select('_id content').lean()
      : [];
    const rootById = new Map(roots.map((msg) => [String(msg._id), msg]));

    const items = threads.map((thread) => toThreadListItem({
      thread,
      rootMessage: rootById.get(String(thread.rootMessageId)) || null,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getThreadById({ threadId }) {
    const thread = await BookThread.findById(threadId)
      .populate('userId', 'anonymousId username name isAnonymous')
      .lean();
    if (!thread) {
      throw notFound('Thread not found.');
    }

    const rootMessage = thread.rootMessageId
      ? await BookThreadMessage.findById(thread.rootMessageId).select('_id content createdAt').lean()
      : null;

    return toThreadDetail({ thread, rootMessage });
  }

  async listMessages({ threadId, query }) {
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 50, maxLimit: 100 });
    const order = String(query?.order || 'asc').toLowerCase() === 'desc' ? -1 : 1;

    const [threadExists, items, total] = await Promise.all([
      BookThread.exists({ _id: threadId }),
      BookThreadMessage.find({ threadId })
        .sort({ createdAt: order, _id: order })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'anonymousId username name isAnonymous')
        .lean(),
      BookThreadMessage.countDocuments({ threadId }),
    ]);

    if (!threadExists) {
      throw notFound('Thread not found.');
    }

    return {
      items: items.map(toMessageDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async addMessage({ threadId, userId, content, parentMessageId = null }) {
    const sanitizedContent = sanitizeText(content, 1200);
    if (!sanitizedContent) {
      throw badRequest('Message content is required.');
    }

    const thread = await BookThread.findById(threadId).select('_id rootMessageId').lean();
    if (!thread) {
      throw notFound('Thread not found.');
    }

    let parent = null;
    if (parentMessageId) {
      parent = await BookThreadMessage.findById(parentMessageId).select('_id threadId').lean();
      if (!parent) {
        throw badRequest('Parent message does not exist.');
      }
      if (String(parent.threadId) !== String(threadId)) {
        throw badRequest('Parent message does not belong to this thread.');
      }
    }

    const message = await BookThreadMessage.create({
      threadId,
      userId,
      content: sanitizedContent,
      parentMessageId: parent ? parent._id : null,
      likes: 0,
      likedBy: [],
    });

    await BookThread.updateOne(
      { _id: threadId },
      {
        $inc: { messageCount: 1 },
        $set: { lastMessageAt: message.createdAt },
      },
    );

    const hydrated = await BookThreadMessage.findById(message._id)
      .populate('userId', 'anonymousId username name isAnonymous')
      .lean();

    return toMessageDto(hydrated);
  }

  async toggleThreadLike({ threadId, actorId }) {
    const thread = await BookThread.findById(threadId).select('likes likedBy').lean();
    if (!thread) {
      throw notFound('Thread not found.');
    }

    const actorKey = String(actorId);
    const likedBy = Array.isArray(thread.likedBy) ? thread.likedBy.map(String) : [];
    const hasLiked = likedBy.includes(actorKey);

    const update = hasLiked
      ? { $pull: { likedBy: actorId }, $inc: { likes: -1 } }
      : { $addToSet: { likedBy: actorId }, $inc: { likes: 1 } };

    await BookThread.updateOne({ _id: threadId }, update);
    const updated = await BookThread.findById(threadId)
      .populate('userId', 'anonymousId username name isAnonymous')
      .lean();
    const rootMessage = updated?.rootMessageId
      ? await BookThreadMessage.findById(updated.rootMessageId).select('_id content').lean()
      : null;
    return toThreadDetail({ thread: updated, rootMessage });
  }

  async toggleMessageLike({ threadId, messageId, actorId }) {
    const message = await BookThreadMessage.findById(messageId).select('threadId likes likedBy').lean();
    if (!message) {
      throw notFound('Message not found.');
    }
    if (String(message.threadId) !== String(threadId)) {
      throw badRequest('Message does not belong to this thread.');
    }

    const actorKey = String(actorId);
    const likedBy = Array.isArray(message.likedBy) ? message.likedBy.map(String) : [];
    const hasLiked = likedBy.includes(actorKey);

    const update = hasLiked
      ? { $pull: { likedBy: actorId }, $inc: { likes: -1 } }
      : { $addToSet: { likedBy: actorId }, $inc: { likes: 1 } };

    await BookThreadMessage.updateOne({ _id: messageId }, update);
    const updated = await BookThreadMessage.findById(messageId)
      .populate('userId', 'anonymousId username name isAnonymous')
      .lean();
    return toMessageDto(updated);
  }
}

import mongoose from 'mongoose';
import { Thread } from '../models/Thread.js';

const buildSortQuery = (sort) => {
  if (sort === 'top' || sort === 'hot') {
    return { likes: -1, updatedAt: -1, createdAt: -1 };
  }

  return { updatedAt: -1, createdAt: -1 };
};

const findCommentById = (comments, commentId) => {
  for (const comment of comments) {
    if (String(comment._id) === String(commentId)) {
      return comment;
    }

    const nestedMatch = findCommentById(comment.replies || [], commentId);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
};

const normalizeBookKey = (value) => String(value || '').trim().slice(0, 180);

const buildBookFilter = (bookKey) => {
  const normalized = normalizeBookKey(bookKey);
  if (!normalized) {
    const error = new Error('Book reference is required.');
    error.statusCode = 400;
    throw error;
  }

  if (mongoose.Types.ObjectId.isValid(normalized)) {
    return {
      $or: [
        { bookKey: normalized },
        { bookId: new mongoose.Types.ObjectId(normalized) },
      ],
    };
  }

  return { bookKey: normalized };
};

const toggleLike = (entity, actorId) => {
  if (!actorId) {
    return { liked: false };
  }

  if (!Array.isArray(entity.likedBy)) {
    entity.likedBy = [];
  }

  const actorKey = String(actorId);
  const existingIndex = entity.likedBy.findIndex((value) => String(value) === actorKey);
  const currentLikes = Number(entity.likes || 0);

  if (existingIndex >= 0) {
    entity.likedBy.splice(existingIndex, 1);
    entity.likes = Math.max(0, currentLikes - 1);
    return { liked: false };
  }

  entity.likedBy.push(actorKey);
  entity.likes = currentLikes + 1;
  return { liked: true };
};

export const getThreadsByBook = async (req, res) => {
  try {
    const bookKey = String(req.params.bookId || '').trim();
    const requestedLimit = Number.parseInt(String(req.query?.limit ?? '25'), 10);
    const requestedPage = Number.parseInt(String(req.query?.page ?? '1'), 10);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit)) : 25;
    const safePage = Number.isFinite(requestedPage) ? Math.max(1, Math.min(100, requestedPage)) : 1;

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    if (req.user?.isAnonymous) {
      return res.status(403).json({ message: 'Please sign in to join BookThreads.' });
    }

    const filter = buildBookFilter(bookKey);

    const [threads, total] = await Promise.all([
      Thread.find(filter)
        .sort(buildSortQuery(req.query.sort))
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Thread.countDocuments(filter),
    ]);

    res.json({
      items: threads,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: status >= 500 ? 'Error fetching threads' : (error.message || 'Request failed.') });
  }
};

export const createThread = async (req, res) => {
  try {
    const rawBookKey = req.body?.bookKey || req.body?.bookId;
    const { title, content, chapterReference } = req.body || {};

    if (!rawBookKey || !title?.trim() || !content?.trim()) {
      return res.status(400).json({ message: 'Book, title, and content are required.' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    if (req.user?.isAnonymous) {
      return res.status(403).json({ message: 'Please sign in to join BookThreads.' });
    }

    if (String(title).trim().length > 100) {
      return res.status(400).json({ message: 'Title must be 100 characters or fewer.' });
    }

    if (String(content).trim().length > 3_000) {
      return res.status(400).json({ message: 'Thread content must be 3000 characters or fewer.' });
    }

    const bookKey = normalizeBookKey(rawBookKey);
    if (!bookKey) {
      return res.status(400).json({ message: 'Book reference is required.' });
    }

    const authorAnonId = req.user ? req.user.anonymousId : 'Anonymous Reader';

    const doc = {
      bookKey,
      authorAnonId,
      title: title.trim(),
      chapterReference: chapterReference?.trim() || '',
      content: content.trim(),
      likes: 0,
      likedBy: [],
      comments: [],
    };

    if (mongoose.Types.ObjectId.isValid(bookKey)) {
      doc.bookId = new mongoose.Types.ObjectId(bookKey);
    }

    const thread = await Thread.create({
      ...doc,
    });

    res.status(201).json(thread);
  } catch {
    res.status(500).json({ message: 'Error creating thread' });
  }
};

export const addComment = async (req, res) => {
  try {
    const threadId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ message: 'Invalid thread reference.' });
    }

    const thread = await Thread.findById(threadId);
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    if (req.user?.isAnonymous) {
      return res.status(403).json({ message: 'Please sign in to join BookThreads.' });
    }

    const content = req.body.content?.trim();
    if (!content) {
      return res.status(400).json({ message: 'Comment content is required.' });
    }
    if (content.length > 1_200) {
      return res.status(400).json({ message: 'Comment content must be 1200 characters or fewer.' });
    }

    const newComment = {
      authorAnonId: req.user ? req.user.anonymousId : 'Anonymous Reader',
      content,
      likes: 0,
      likedBy: [],
      replies: [],
    };

    if (req.body.parentId) {
      const parentComment = findCommentById(thread.comments, req.body.parentId);
      if (!parentComment) {
        return res.status(404).json({ message: 'Parent comment not found.' });
      }

      parentComment.replies.push(newComment);
    } else {
      thread.comments.push(newComment);
    }

    await thread.save();
    res.status(201).json(thread);
  } catch {
    res.status(500).json({ message: 'Error adding comment' });
  }
};

export const likeThread = async (req, res) => {
  try {
    const threadId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ message: 'Invalid thread reference.' });
    }

    const thread = await Thread.findById(threadId);
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    if (req.user?.isAnonymous) {
      return res.status(403).json({ message: 'Please sign in to join BookThreads.' });
    }

    toggleLike(thread, req.user?._id);
    await thread.save();

    res.json(thread);
  } catch {
    res.status(500).json({ message: 'Error liking thread' });
  }
};

export const likeComment = async (req, res) => {
  try {
    const threadId = String(req.params.threadId || '').trim();
    const commentId = String(req.params.commentId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(threadId) || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'Invalid comment reference.' });
    }

    const thread = await Thread.findById(threadId);
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    if (req.user?.isAnonymous) {
      return res.status(403).json({ message: 'Please sign in to join BookThreads.' });
    }

    const comment = findCommentById(thread.comments, commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    toggleLike(comment, req.user?._id);
    await thread.save();

    res.json(thread);
  } catch {
    res.status(500).json({ message: 'Error liking comment' });
  }
};

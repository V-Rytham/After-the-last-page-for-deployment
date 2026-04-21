import mongoose from 'mongoose';
import { BookThreadsService } from './bookThreadsService.js';
import { resolveBookOrThrow } from './bookResolver.js';
import { forbidden, unauthorized, sendError } from './httpErrors.js';
import { parseObjectId } from './validators.js';

const service = new BookThreadsService();

const requireUserOrThrow = (req) => {
  if (!req.user?._id) {
    throw unauthorized('Unauthorized.');
  }

  if (req.user?.isAnonymous) {
    throw forbidden('Please sign in to join BookThreads.');
  }

  const raw = String(req.user._id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw unauthorized('Unauthorized.');
  }

  return new mongoose.Types.ObjectId(raw);
};

export const createThread = async (req, res) => {
  try {
    const actorId = requireUserOrThrow(req);
    const book = await resolveBookOrThrow(req.params.bookId);

    const payload = await service.createThread({
      bookId: book._id,
      userId: actorId,
      title: req.body?.title,
      content: req.body?.content,
      chapterReference: req.body?.chapterReference,
    });

    return res.status(201).json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to create thread.');
  }
};

export const listThreadsByBook = async (req, res) => {
  try {
    requireUserOrThrow(req);
    const book = await resolveBookOrThrow(req.params.bookId);
    const payload = await service.listThreadsByBook({ bookId: book._id, query: req.query });
    return res.json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to fetch threads.');
  }
};

export const getThread = async (req, res) => {
  try {
    requireUserOrThrow(req);
    const threadId = parseObjectId(req.params.threadId, 'thread id');
    const payload = await service.getThreadById({ threadId });
    return res.json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to fetch thread.');
  }
};

export const listMessages = async (req, res) => {
  try {
    requireUserOrThrow(req);
    const threadId = parseObjectId(req.params.threadId, 'thread id');
    const payload = await service.listMessages({ threadId, query: req.query });
    return res.json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to fetch messages.');
  }
};

export const addMessage = async (req, res) => {
  try {
    const actorId = requireUserOrThrow(req);
    const threadId = parseObjectId(req.params.threadId, 'thread id');

    const parentMessageIdRaw = req.body?.parentMessageId ? String(req.body.parentMessageId).trim() : '';
    const parentMessageId = parentMessageIdRaw ? parseObjectId(parentMessageIdRaw, 'parent message id') : null;

    const payload = await service.addMessage({
      threadId,
      userId: actorId,
      content: req.body?.content,
      parentMessageId,
    });

    return res.status(201).json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to add message.');
  }
};

export const toggleThreadLike = async (req, res) => {
  try {
    const actorId = requireUserOrThrow(req);
    const threadId = parseObjectId(req.params.threadId, 'thread id');
    const payload = await service.toggleThreadLike({ threadId, actorId });
    return res.json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to like thread.');
  }
};

export const toggleMessageLike = async (req, res) => {
  try {
    const actorId = requireUserOrThrow(req);
    const threadId = parseObjectId(req.params.threadId, 'thread id');
    const messageId = parseObjectId(req.params.messageId, 'message id');

    const payload = await service.toggleMessageLike({ threadId, messageId, actorId });
    return res.json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to like message.');
  }
};

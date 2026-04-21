import express from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import {
  addMessage,
  createThread,
  getThread,
  listMessages,
  listThreadsByBook,
  toggleMessageLike,
  toggleThreadLike,
} from './bookThreadsController.js';

export const buildBookThreadsRoutes = () => {
  const router = express.Router();

  router.post('/books/:bookId/threads', requireAuth, createThread);
  router.get('/books/:bookId/threads', requireAuth, listThreadsByBook);

  router.get('/threads/:threadId', requireAuth, getThread);
  router.post('/threads/:threadId/like', requireAuth, toggleThreadLike);

  router.get('/threads/:threadId/messages', requireAuth, listMessages);
  router.post('/threads/:threadId/messages', requireAuth, addMessage);
  router.post('/threads/:threadId/messages/:messageId/like', requireAuth, toggleMessageLike);

  return router;
};


import express from 'express';
import { attachIdentity } from '../../middleware/identityMiddleware.js';
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

  router.post('/books/:bookId/threads', attachIdentity, createThread);
  router.get('/books/:bookId/threads', attachIdentity, listThreadsByBook);

  router.get('/threads/:threadId', attachIdentity, getThread);
  router.post('/threads/:threadId/like', attachIdentity, toggleThreadLike);

  router.get('/threads/:threadId/messages', attachIdentity, listMessages);
  router.post('/threads/:threadId/messages', attachIdentity, addMessage);
  router.post('/threads/:threadId/messages/:messageId/like', attachIdentity, toggleMessageLike);

  return router;
};


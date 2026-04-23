import express from 'express';
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

  router.post('/books/:bookId/threads', createThread);
  router.get('/books/:bookId/threads', listThreadsByBook);

  router.get('/threads/:threadId', getThread);
  router.post('/threads/:threadId/like', toggleThreadLike);

  router.get('/threads/:threadId/messages', listMessages);
  router.post('/threads/:threadId/messages', addMessage);
  router.post('/threads/:threadId/messages/:messageId/like', toggleMessageLike);

  return router;
};

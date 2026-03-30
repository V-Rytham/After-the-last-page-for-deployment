import express from 'express';
import { getThreadsByBook, createThread, addComment, likeThread, likeComment } from '../controllers/threadController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/:bookId', protect, getThreadsByBook);
router.post('/', protect, createThread);
router.post('/:id/comments', protect, addComment);
router.post('/:id/like', protect, likeThread);
router.post('/:threadId/comments/:commentId/like', protect, likeComment);

export default router;

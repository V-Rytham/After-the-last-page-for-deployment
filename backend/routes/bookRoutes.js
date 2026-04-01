import express from 'express';
import {
  getBooks,
  getBookById,
  readBook,
  readGutenbergBook,
} from '../controllers/bookController.js';

const router = express.Router();

router.get('/', getBooks);
router.get('/gutenberg/:gutenbergId/read', readGutenbergBook);
router.get('/:id/read', readBook);
router.get('/:id', getBookById);

export default router;

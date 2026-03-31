import express from 'express';
import {
  getBooks,
  getBookById,
  getBookContent,
  previewBookRequest,
  requestBookIngestion,
  readBook,
  reprocessBook,
} from '../controllers/bookController.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

router.get('/', getBooks);
router.get('/preview/:gutenbergId', rateLimit({ windowMs: 60_000, max: 30 }), previewBookRequest);
router.post('/request', rateLimit({ windowMs: 60_000, max: 10 }), requestBookIngestion);
router.get('/:id/read', readBook);
router.get('/:id/content', getBookContent);
router.post('/:id/reprocess', reprocessBook);
router.get('/:id', getBookById);

export default router;

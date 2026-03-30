import express from 'express';
import { getBooks, getBookById, getBookContent } from '../controllers/bookController.js';

const router = express.Router();

router.get('/', getBooks);
router.get('/:id/content', getBookContent);
router.get('/:id', getBookById);

export default router;

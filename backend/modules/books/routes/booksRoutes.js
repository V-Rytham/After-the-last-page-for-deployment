import express from 'express';
import { requireAuth } from '../../../middleware/authMiddleware.js';

export const buildBooksRoutes = ({ booksController }) => {
  const router = express.Router();

  router.get('/', booksController.getBooks);
  router.get('/library', requireAuth, booksController.getLibraryFeed);
  router.get('/search', booksController.searchBooks);
  router.get('/gutenberg/search', booksController.searchBooks);
  router.get('/gutenberg/:gutenbergId/preview', booksController.getGutenbergPreview);
  router.get('/gutenberg/:gutenbergId/read', booksController.readGutenbergBook);
  router.get('/read', booksController.readBookBySource);
  router.get('/:id/read', booksController.readBook);
  router.get('/:id', booksController.getBookById);

  return router;
};

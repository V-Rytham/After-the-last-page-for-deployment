import { BooksRepository } from './repositories/booksRepository.js';
import { BooksService } from './services/booksService.js';
import { BooksController } from './controllers/booksController.js';
import { buildBooksRoutes } from './routes/booksRoutes.js';

export const createBooksModule = () => {
  const repository = new BooksRepository();
  const service = new BooksService({ repository });
  const controller = new BooksController({ booksService: service });
  const router = buildBooksRoutes({ booksController: controller });

  return {
    name: 'books',
    service,
    router,
  };
};

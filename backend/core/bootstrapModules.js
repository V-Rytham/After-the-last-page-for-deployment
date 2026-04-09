import { createBooksModule } from '../modules/books/index.js';

export const bootstrapFeatureModules = () => {
  const booksModule = createBooksModule();

  return {
    booksModule,
  };
};

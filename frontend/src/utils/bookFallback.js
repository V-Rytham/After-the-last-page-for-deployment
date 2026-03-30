import { mockBooks } from '../data/mockBooks';

export const getFallbackBooks = () => mockBooks;

export const getFallbackBookById = (bookId) => (
  mockBooks.find((book) => book.id === bookId) || null
);

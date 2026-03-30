import { gutenbergCatalog } from './gutenbergCatalog.js';
import { normalizeTags } from '../utils/tags.js';

export const defaultBooks = gutenbergCatalog.map((book) => ({
  title: book.title,
  author: book.author,
  isbn: book.isbn,
  gutenbergId: book.gutenbergId,
  sourceUrl: `https://www.gutenberg.org/ebooks/${book.gutenbergId}`,
  coverImage: `https://www.gutenberg.org/cache/epub/${book.gutenbergId}/pg${book.gutenbergId}.cover.medium.jpg`,
  synopsis: book.synopsis || 'A public domain edition from Project Gutenberg, prepared for calm reading.',
  minReadHours: book.minReadHours ?? 2,
  coverColor: book.coverColor,
  series: book.series,
  seriesIndex: book.seriesIndex,
  tags: normalizeTags(book.tags || []),
}));

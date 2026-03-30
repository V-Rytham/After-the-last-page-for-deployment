import test from 'node:test';
import assert from 'node:assert/strict';
import { gutenbergIngestionService } from '../services/gutenbergIngestionService.js';
import { Book } from '../models/Book.js';

test('ensureBookRecord recovers from duplicate-key upsert race', async () => {
  const originalFetchPreview = gutenbergIngestionService.fetchPreview;
  const originalFindOneAndUpdate = Book.findOneAndUpdate;

  let calls = 0;

  gutenbergIngestionService.fetchPreview = async () => ({
    gutenbergId: 9650,
    title: 'Independent Bohemia',
    author: 'Nosek',
    coverImage: 'https://example.com/cover.jpg',
    sourceUrl: 'https://example.com/book',
  });

  Book.findOneAndUpdate = async (...args) => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }

    return {
      _id: 'book-id',
      gutenbergId: args[0]?.gutenbergId,
      status: args[1]?.$set?.status,
    };
  };

  try {
    const book = await gutenbergIngestionService.ensureBookRecord(9650, { status: 'pending' });
    assert.equal(calls, 2);
    assert.equal(book.gutenbergId, 9650);
  } finally {
    gutenbergIngestionService.fetchPreview = originalFetchPreview;
    Book.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

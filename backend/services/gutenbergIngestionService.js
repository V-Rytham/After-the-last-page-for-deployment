import { Book } from '../models/Book.js';
import mongoose from 'mongoose';
import {
  convertTextToChapters,
  fetchGutendexBook,
  fetchGutenbergText,
  getGutenbergBookPageUrl,
  getGutenbergCoverUrl,
  stripGutenbergBoilerplate,
} from '../utils/gutenberg.js';

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const getPrimaryAuthor = (gutendexBook) => {
  const authors = Array.isArray(gutendexBook?.authors) ? gutendexBook.authors : [];
  const first = authors[0];
  if (!first || !first.name) {
    return 'Unknown';
  }

  return String(first.name).trim() || 'Unknown';
};

const toPreview = (gutendexBook, gutenbergId) => ({
  title: String(gutendexBook?.title || `Project Gutenberg #${gutenbergId}`).trim(),
  author: getPrimaryAuthor(gutendexBook),
  coverImage: gutendexBook?.formats?.['image/jpeg'] || getGutenbergCoverUrl(gutenbergId, 'medium'),
  sourceUrl: gutendexBook?.url || getGutenbergBookPageUrl(gutenbergId),
});

class GutenbergIngestionService {
  constructor() {
    this.queue = [];
    this.queued = new Set();
    this.processing = false;
  }

  async fetchPreview(gutenbergIdInput) {
    const gutenbergId = parsePositiveInt(gutenbergIdInput);
    if (!gutenbergId) {
      return null;
    }

    const gutendexBook = await fetchGutendexBook(gutenbergId);
    if (!gutendexBook) {
      return null;
    }

    return {
      gutenbergId,
      ...toPreview(gutendexBook, gutenbergId),
    };
  }

  async ensureBookRecord(gutenbergIdInput, { status = 'pending', requestedBy = null } = {}) {
    const gutenbergId = parsePositiveInt(gutenbergIdInput);
    if (!gutenbergId) {
      return null;
    }

    const preview = await this.fetchPreview(gutenbergId);
    if (!preview) {
      return null;
    }

    const allowedStatus = ['pending', 'ready', 'failed'];

    const safeStatus = allowedStatus.includes(status)
      ? status
      : 'pending';
    const updateDoc = {
      $setOnInsert: {
        title: preview.title,
        author: preview.author,
        coverImage: preview.coverImage,
        sourceProvider: 'Project Gutenberg',
        sourceUrl: preview.sourceUrl,
        rights: 'Public domain (Project Gutenberg)',
        requestedAt: new Date(),
      },
      

      $set: {
        status: safeStatus,
        sourceProvider: 'Project Gutenberg',
        sourceUrl: preview.sourceUrl,
        coverImage: preview.coverImage,
      },
    };

    if (requestedBy && mongoose.Types.ObjectId.isValid(requestedBy)) {
      updateDoc.$set.requestedBy = requestedBy;
      updateDoc.$set.requestedAt = new Date();
    }

    let book = null;
    try {
      book = await Book.findOneAndUpdate(
        { gutenbergId },
        updateDoc,
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      if (Number(error?.code) !== 11000) {
        throw error;
      }

      // Concurrent requests can race the upsert path; recover by updating/fetching the
      // now-existing record instead of failing the request with a 500.
      book = await Book.findOneAndUpdate(
        { gutenbergId },
        updateDoc,
        { new: true },
      );
    }

    return book;
  }

  enqueue(gutenbergIdInput) {
    const gutenbergId = parsePositiveInt(gutenbergIdInput);
    if (!gutenbergId) {
      return false;
    }

    if (this.queued.has(gutenbergId)) {
      return false;
    }

    this.queue.push(gutenbergId);
    this.queued.add(gutenbergId);
    setImmediate(() => {
      this.processQueue().catch((error) => {
        console.error('[INGESTION] Queue processing failed:', error?.message || error);
      });
    });

    return true;
  }

  async processQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const gutenbergId = this.queue.shift();
        this.queued.delete(gutenbergId);

        try {
          await this.ingest(gutenbergId);
        } catch (error) {
          console.error(`[INGESTION] Failed for Gutenberg ${gutenbergId}:`, error?.message || error);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async ingest(gutenbergIdInput) {
    const gutenbergId = parsePositiveInt(gutenbergIdInput);
    if (!gutenbergId) {
      return null;
    }

    await Book.updateOne(
      { gutenbergId },
      { $set: { status: 'pending', ingestionError: null } },
    );

    try {
      const preview = await this.fetchPreview(gutenbergId);
      if (!preview) {
        throw new Error('Book not found on Gutendex.');
      }

      const rawText = await fetchGutenbergText(gutenbergId);
      const textContent = stripGutenbergBoilerplate(rawText);
      const chapters = convertTextToChapters(textContent, { fallbackTitle: 'Chapter' });

      await Book.findOneAndUpdate(
        { gutenbergId },
        {
          $set: {
            title: preview.title,
            author: preview.author,
            coverImage: preview.coverImage,
            sourceProvider: 'Project Gutenberg',
            sourceUrl: preview.sourceUrl,
            rights: 'Public domain (Project Gutenberg)',
            textContent,
            chapters,
            status: 'ready',
            ingestionError: null,
          },
        },
        { new: true },
      );

      return { gutenbergId, status: 'ready', chapters: chapters.length };
    } catch (error) {
      await Book.updateOne(
        { gutenbergId },
        {
          $set: {
            status: 'failed',
            ingestionError: String(error?.message || error),
          },
        },
      );

      throw error;
    }
  }

  async enqueuePendingBooks() {
    const [pendingBooks, failedBooks] = await Promise.all([
      Book.find({ status: 'pending' })
        .select('gutenbergId status')
        .lean(),
      Book.find({ status: 'failed' })
        .select('gutenbergId status')
        .lean(),
    ]);
    const booksToEnqueue = [...pendingBooks, ...failedBooks];

    booksToEnqueue.forEach((book) => {
      if (book?.gutenbergId) {
        this.enqueue(book.gutenbergId);
      }
    });
  }
}

export const gutenbergIngestionService = new GutenbergIngestionService();
export { parsePositiveInt };

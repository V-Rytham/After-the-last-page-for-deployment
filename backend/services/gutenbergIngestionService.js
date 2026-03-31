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
import { parsePositiveIntStrict } from '../utils/gutenbergId.js';

const MAX_INGESTION_RETRIES = 3;
const PROCESSING_STALE_MS = 15 * 60_000;
const WATCHDOG_INTERVAL_MS = 30_000;
const MAX_INGESTION_TIME_MS = 120_000;

const runWithTimeout = async (promiseFactory, timeoutMs, { gutenbergId }) => {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new Error('Ingestion timed out.');
      timeoutError.code = 'INGESTION_TIMEOUT';
      timeoutError.statusCode = 504;
      timeoutError.gutenbergId = gutenbergId;
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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
    this.watchdogTimer = setInterval(() => {
      this.recoverStaleProcessingBooks().catch((error) => {
        console.error('[INGESTION] Watchdog recovery failed:', error?.message || error);
      });
    }, WATCHDOG_INTERVAL_MS);
    this.watchdogTimer.unref?.();
  }

  async fetchPreview(gutenbergIdInput) {
    const gutenbergId = parsePositiveIntStrict(gutenbergIdInput);
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
    const gutenbergId = parsePositiveIntStrict(gutenbergIdInput);
    if (!gutenbergId) {
      return null;
    }

    const preview = await this.fetchPreview(gutenbergId);
    if (!preview) {
      return null;
    }

    const allowedStatus = ['pending', 'processing', 'ready', 'failed'];

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

  async enqueue(gutenbergIdInput) {
    const gutenbergId = parsePositiveIntStrict(gutenbergIdInput);
    if (!gutenbergId) {
      return false;
    }

    const book = await Book.findOne({ gutenbergId })
      .select('status retryCount')
      .lean();

    if (!book) {
      return false;
    }

    if (book.status === 'ready' || book.status === 'processing') {
      return false;
    }

    if (book.status === 'failed' && Number(book.retryCount || 0) >= MAX_INGESTION_RETRIES) {
      return false;
    }

    if (book.status === 'failed') {
      await Book.updateOne(
        {
          gutenbergId,
          status: { $in: ['failed'] },
        },
        {
          $set: {
            status: 'pending',
          },
        },
      );
    }

    if (this.queued.has(gutenbergId)) {
      return false;
    }

    this.queued.add(gutenbergId);
    this.queue.push(gutenbergId);
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
    const gutenbergId = parsePositiveIntStrict(gutenbergIdInput);
    if (!gutenbergId) {
      return null;
    }

    const claimed = await Book.findOneAndUpdate(
      {
        gutenbergId,
        status: { $in: ['pending', 'failed'] },
      },
      {
        $set: {
          status: 'processing',
          ingestionError: null,
          processingStartedAt: new Date(),
          lastIngestionAttemptAt: new Date(),
        },
      },
      { new: true },
    );
    if (!claimed) {
      return null;
    }

    console.info('[INGESTION_EVENT]', { event: 'ingestion_started', gutenbergId });
    try {
      const ingestionPayload = await runWithTimeout(async () => {
        const preview = await this.fetchPreview(gutenbergId);
        if (!preview) {
          throw new Error('Book not found on Gutendex.');
        }

        const rawText = await fetchGutenbergText(gutenbergId);
        const textContent = stripGutenbergBoilerplate(rawText);
        const chapters = convertTextToChapters(textContent, { fallbackTitle: 'Chapter' });
        return { preview, textContent, chapters };
      }, MAX_INGESTION_TIME_MS, { gutenbergId });

      const updated = await Book.findOneAndUpdate(
        { gutenbergId, status: 'processing' },
        {
          $set: {
            title: ingestionPayload.preview.title,
            author: ingestionPayload.preview.author,
            coverImage: ingestionPayload.preview.coverImage,
            sourceProvider: 'Project Gutenberg',
            sourceUrl: ingestionPayload.preview.sourceUrl,
            rights: 'Public domain (Project Gutenberg)',
            textContent: ingestionPayload.textContent,
            chapters: ingestionPayload.chapters,
            status: 'ready',
            ingestionError: null,
            retryCount: 0,
            processingStartedAt: null,
          },
        },
        { new: true },
      );
      if (!updated) {
        return null;
      }

      console.info('[INGESTION_EVENT]', { event: 'ingestion_success', gutenbergId });
      return { gutenbergId, status: 'ready', chapters: ingestionPayload.chapters.length };
    } catch (error) {
      const timeoutFailure = error?.code === 'INGESTION_TIMEOUT';
      if (timeoutFailure) {
        console.error('[INGESTION_EVENT]', { event: 'ingestion_timeout', gutenbergId });
      }

      await Book.updateOne(
        { gutenbergId },
        [
          {
            $set: {
              status: 'failed',
              ingestionError: String(error?.message || error),
              processingStartedAt: null,
              retryCount: {
                $min: [
                  { $add: [{ $ifNull: ['$retryCount', 0] }, 1] },
                  MAX_INGESTION_RETRIES,
                ],
              },
            },
          },
        ],
      );
      console.error('[INGESTION_EVENT]', {
        event: 'ingestion_failed',
        gutenbergId,
        reason: String(error?.message || error),
      });

      throw error;
    }
  }

  async enqueuePendingBooks() {
    await this.recoverStaleProcessingBooks();

    const [pendingBooks, failedBooks] = await Promise.all([
      Book.find({ status: 'pending' })
        .select('gutenbergId status retryCount')
        .lean(),
      Book.find({ status: 'failed', retryCount: { $lt: MAX_INGESTION_RETRIES } })
        .select('gutenbergId status retryCount')
        .lean(),
    ]);
    const booksToEnqueue = [...pendingBooks, ...failedBooks];

    await Promise.all(booksToEnqueue.map(async (book) => {
      if (book?.gutenbergId) {
        await this.enqueue(book.gutenbergId);
      }
    }));
  }

  async recoverStaleProcessingBooks() {
    const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS);
    const staleBooks = await Book.find({
      status: 'processing',
      processingStartedAt: { $lt: staleBefore },
    })
      .select('gutenbergId')
      .lean();

    if (!staleBooks.length) {
      return 0;
    }

    const staleIds = [...new Set(staleBooks
      .map((book) => parsePositiveIntStrict(book?.gutenbergId))
      .filter(Boolean))];
    if (!staleIds.length) {
      return 0;
    }

    await Book.updateMany(
      {
        status: 'processing',
        processingStartedAt: { $lt: staleBefore },
        gutenbergId: { $in: staleIds },
      },
      {
        $set: {
          status: 'pending',
          processingStartedAt: null,
        },
      },
    );

    await Promise.all(staleIds.map(async (gutenbergId) => {
      const book = await Book.findOne({ gutenbergId })
        .select('status')
        .lean();
      if (book?.status === 'pending') {
        console.info('[INGESTION_EVENT]', { event: 'watchdog_recovered', gutenbergId });
        await this.enqueue(gutenbergId);
      }
    }));
    return staleIds.length;
  }
}

export const gutenbergIngestionService = new GutenbergIngestionService();

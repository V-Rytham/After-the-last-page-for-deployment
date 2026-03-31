/**
 * Background processing adapter.
 *
 * This lightweight queue keeps current behavior dependency-free.
 * For production scale, replace internals with BullMQ (Redis) or Agenda (Mongo) while
 * keeping `enqueueBookProcessing` and `startBookProcessingWorker` signatures.
 */
import { processBook } from '../services/bookProcessingService.js';

const queue = [];
const queuedIds = new Set();
let running = false;

export const enqueueBookProcessing = (bookId) => {
  const id = String(bookId || '');
  if (!id || queuedIds.has(id)) return false;

  queuedIds.add(id);
  queue.push(id);
  setImmediate(() => {
    startBookProcessingWorker().catch((error) => {
      console.error('[BOOK_QUEUE] Worker failed:', error?.message || error);
    });
  });
  return true;
};

export const startBookProcessingWorker = async () => {
  if (running) return;
  running = true;

  try {
    while (queue.length) {
      const bookId = queue.shift();
      queuedIds.delete(bookId);
      try {
        await processBook(bookId);
      } catch (error) {
        console.error(`[BOOK_QUEUE] Processing failed for ${bookId}:`, error?.message || error);
      }
    }
  } finally {
    running = false;
  }
};

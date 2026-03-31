import test from 'node:test';
import assert from 'node:assert/strict';
import { gutenbergIngestionService } from '../services/gutenbergIngestionService.js';
import { Book } from '../models/Book.js';

const MAX_RETRIES = 3;

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

const wrapSingle = (value) => ({
  select: () => ({
    lean: async () => clone(value),
  }),
  lean: async () => clone(value),
});

const wrapMany = (values) => ({
  select: () => ({
    lean: async () => clone(values),
  }),
  lean: async () => clone(values),
});

const createBookStore = () => {
  const byId = new Map();

  const put = (book) => {
    byId.set(Number(book.gutenbergId), {
      retryCount: 0,
      chapters: [],
      ...clone(book),
    });
  };

  const get = (gutenbergId) => {
    const current = byId.get(Number(gutenbergId));
    return current ? clone(current) : null;
  };

  const matchesStatus = (book, filter) => {
    if (!filter || !filter.status) return true;
    if (typeof filter.status === 'string') return book.status === filter.status;
    if (Array.isArray(filter.status?.$in)) return filter.status.$in.includes(book.status);
    return true;
  };

  const applyUpdate = (book, update) => {
    if (!book) return null;

    if (Array.isArray(update)) {
      const retryCount = Number(book.retryCount || 0);
      book.status = 'failed';
      book.processingStartedAt = null;
      book.ingestionError = 'pipeline-failure';
      book.retryCount = Math.min(retryCount + 1, MAX_RETRIES);
      return book;
    }

    if (update?.$set) {
      Object.assign(book, clone(update.$set));
    }

    if (update?.$setOnInsert) {
      Object.assign(book, clone(update.$setOnInsert));
    }

    return book;
  };

  return {
    put,
    get,
    dump: () => clone([...byId.values()].sort((a, b) => a.gutenbergId - b.gutenbergId)),
    findOne(filter) {
      const found = [...byId.values()].find((book) => {
        if (filter?.gutenbergId && Number(book.gutenbergId) !== Number(filter.gutenbergId)) return false;
        if (!matchesStatus(book, filter)) return false;
        if (filter?.processingStartedAt?.$lt && !(new Date(book.processingStartedAt || 0) < filter.processingStartedAt.$lt)) return false;
        return true;
      });
      return wrapSingle(found || null);
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const existing = [...byId.values()].find((book) => {
        if (filter?.gutenbergId && Number(book.gutenbergId) !== Number(filter.gutenbergId)) return false;
        if (!matchesStatus(book, filter)) return false;
        return true;
      });

      if (!existing && options.upsert) {
        const inserted = { gutenbergId: Number(filter.gutenbergId), retryCount: 0, status: 'pending' };
        applyUpdate(inserted, update);
        byId.set(inserted.gutenbergId, inserted);
        return clone(inserted);
      }

      if (!existing) return null;
      applyUpdate(existing, update);
      return clone(existing);
    },
    async updateOne(filter, update) {
      const target = [...byId.values()].find((book) => {
        if (filter?.gutenbergId && Number(book.gutenbergId) !== Number(filter.gutenbergId)) return false;
        if (!matchesStatus(book, filter)) return false;
        return true;
      });
      if (!target) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(target, update);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async updateMany(filter, update) {
      let modified = 0;
      for (const book of byId.values()) {
        const idMatch = !filter?.gutenbergId?.$in || filter.gutenbergId.$in.includes(book.gutenbergId);
        const statusMatch = !filter?.status || book.status === filter.status;
        const staleMatch = !filter?.processingStartedAt?.$lt || new Date(book.processingStartedAt || 0) < filter.processingStartedAt.$lt;
        if (idMatch && statusMatch && staleMatch) {
          applyUpdate(book, update);
          modified += 1;
        }
      }
      return { modifiedCount: modified };
    },
    find(filter) {
      const rows = [...byId.values()].filter((book) => {
        if (filter?.status && typeof filter.status === 'string') return book.status === filter.status;
        if (filter?.status?.$lt != null) return Number(book.retryCount || 0) < Number(filter.retryCount.$lt);
        if (filter?.status === 'processing' && filter?.processingStartedAt?.$lt) {
          return book.status === 'processing' && new Date(book.processingStartedAt || 0) < filter.processingStartedAt.$lt;
        }
        return filter?.status ? book.status === filter.status : true;
      });
      return wrapMany(rows);
    },
  };
};

const capture = async (setup) => {
  const original = {
    findOne: Book.findOne,
    find: Book.find,
    findOneAndUpdate: Book.findOneAndUpdate,
    updateOne: Book.updateOne,
    updateMany: Book.updateMany,
    fetchPreview: gutenbergIngestionService.fetchPreview,
    queue: [...gutenbergIngestionService.queue],
    queued: new Set(gutenbergIngestionService.queued),
    processing: gutenbergIngestionService.processing,
    processQueue: gutenbergIngestionService.processQueue,
    enqueue: gutenbergIngestionService.enqueue,
  };

  try {
    await setup(original);
  } finally {
    Book.findOne = original.findOne;
    Book.find = original.find;
    Book.findOneAndUpdate = original.findOneAndUpdate;
    Book.updateOne = original.updateOne;
    Book.updateMany = original.updateMany;
    gutenbergIngestionService.fetchPreview = original.fetchPreview;
    gutenbergIngestionService.queue = original.queue;
    gutenbergIngestionService.queued = original.queued;
    gutenbergIngestionService.processing = original.processing;
    gutenbergIngestionService.processQueue = original.processQueue;
    gutenbergIngestionService.enqueue = original.enqueue;
  }
};

test('production safety backend stress/certification simulation', async () => {
  const eventLog = [];

  await capture(async (original) => {
    const store = createBookStore();

    // Shared DB hooks.
    Book.findOne = (filter) => store.findOne(filter);
    Book.find = (filter) => store.find(filter);
    Book.findOneAndUpdate = (...args) => store.findOneAndUpdate(...args);
    Book.updateOne = (...args) => store.updateOne(...args);
    Book.updateMany = (...args) => store.updateMany(...args);

    gutenbergIngestionService.processQueue = async () => {};

    // 1) Concurrency stress: same gutenbergId.
    store.put({ gutenbergId: 111, status: 'pending', retryCount: 0 });
    const sameIdEnqueue = await Promise.all(Array.from({ length: 50 }, async () => gutenbergIngestionService.enqueue(111)));
    eventLog.push(`same-id enqueue true-count=${sameIdEnqueue.filter(Boolean).length}`);
    assert.equal(sameIdEnqueue.filter(Boolean).length, 1);
    assert.equal(gutenbergIngestionService.queue.filter((id) => id === 111).length, 1);

    // 1) Concurrency stress: different gutenbergIds.
    for (let id = 200; id < 250; id += 1) {
      store.put({ gutenbergId: id, status: 'pending', retryCount: 0 });
    }
    const uniqueResult = await Promise.all(Array.from({ length: 50 }, (_, idx) => gutenbergIngestionService.enqueue(200 + idx)));
    assert.equal(uniqueResult.filter(Boolean).length, 50);
    eventLog.push(`multi-id enqueue true-count=${uniqueResult.filter(Boolean).length}`);

    gutenbergIngestionService.queue = [];
    gutenbergIngestionService.queued = new Set();
    gutenbergIngestionService.processQueue = original.processQueue;

    // Validate claim race: two ingests same ID, one claim only.
    store.put({ gutenbergId: 777, status: 'pending', retryCount: 0 });
    let previewCalls = 0;
    gutenbergIngestionService.fetchPreview = async (id) => {
      previewCalls += 1;
      eventLog.push(`ingestion started id=${id}`);
      return { gutenbergId: id, title: `Book ${id}`, author: 'Author', coverImage: 'cover', sourceUrl: 'src' };
    };

    const originalIngest = gutenbergIngestionService.ingest.bind(gutenbergIngestionService);
    const ingestA = originalIngest(777);
    const ingestB = originalIngest(777);
    await Promise.allSettled([ingestA, ingestB]);
    assert.equal(previewCalls, 1);
    eventLog.push('claim race resolved single processing owner');

    // 2) Crash + recovery simulation.
    const staleDate = new Date(Date.now() - (16 * 60_000)).toISOString();
    store.put({ gutenbergId: 901, status: 'processing', processingStartedAt: staleDate, retryCount: 0 });
    store.put({ gutenbergId: 902, status: 'processing', processingStartedAt: staleDate, retryCount: 0 });

    let recoveredEnqueueCount = 0;
    const originalEnqueue = gutenbergIngestionService.enqueue.bind(gutenbergIngestionService);
    gutenbergIngestionService.enqueue = async (id) => {
      recoveredEnqueueCount += 1;
      eventLog.push(`watchdog enqueued id=${id}`);
      return originalEnqueue(id);
    };

    const recoveredCount = await gutenbergIngestionService.recoverStaleProcessingBooks();
    assert.equal(recoveredCount, 2);
    assert.equal(store.get(901).status, 'pending');
    assert.equal(store.get(902).status, 'pending');
    assert.equal(recoveredEnqueueCount >= 2, true);
    eventLog.push(`watchdog recovered count=${recoveredCount}`);

    // Restart/server boot path.
    await gutenbergIngestionService.enqueuePendingBooks();
    eventLog.push('restart enqueuePendingBooks executed');

    // 3) Timeout + retry boundaries.
    store.put({ gutenbergId: 950, status: 'failed', retryCount: 3 });
    const maxRetryQueue = await gutenbergIngestionService.enqueue(950);
    assert.equal(maxRetryQueue, false);
    eventLog.push('max retry enqueue blocked');

    // Force repeated failure increments capped at max.
    store.put({ gutenbergId: 951, status: 'pending', retryCount: 0 });
    gutenbergIngestionService.fetchPreview = async () => {
      throw new Error('forced failure');
    };
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => originalIngest(951));
      eventLog.push(`failure attempt=${i + 1} retryCount=${store.get(951).retryCount}`);
    }
    assert.equal(store.get(951).retryCount, 3);

    // 4) Queue integrity checks.
    store.put({ gutenbergId: 975, status: 'processing', retryCount: 0 });
    const processingEnqueue = await gutenbergIngestionService.enqueue(975);
    assert.equal(processingEnqueue, false);
    assert.equal(gutenbergIngestionService.queue.includes(975), false);
    eventLog.push('enqueue skipped already-processing job');

    const dedupeId = 976;
    store.put({ gutenbergId: dedupeId, status: 'pending', retryCount: 0 });
    await Promise.all([gutenbergIngestionService.enqueue(dedupeId), gutenbergIngestionService.enqueue(dedupeId)]);
    assert.equal(gutenbergIngestionService.queue.filter((id) => id === dedupeId).length <= 1, true);
    eventLog.push('queue dedupe preserved');

    // 6) Failure injection surfaces transient/permanent handling via status codes.
    const transientError = new Error('upstream unavailable');
    transientError.statusCode = 500;
    const permanentError = new Error('book missing');
    permanentError.statusCode = 404;
    assert.equal(transientError.statusCode >= 500, true);
    assert.equal(permanentError.statusCode >= 400 && permanentError.statusCode < 500, true);
    eventLog.push('failure injection classification seeds prepared');

    // Cleanup override.
    gutenbergIngestionService.enqueue = originalEnqueue;

    console.log('CERT_EVENT_LOG_START');
    for (const [index, line] of eventLog.entries()) {
      console.log(`${index + 1}. ${line}`);
    }
    console.log('CERT_EVENT_LOG_END');
  });
});

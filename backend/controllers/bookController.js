import { Book } from '../models/Book.js';
import mongoose from 'mongoose';
import {
  convertTextToChapters,
  fetchGutenbergText,
  getGutenbergBookPageUrl,
  getGutenbergCoverUrl,
  stripGutenbergBoilerplate,
} from '../utils/gutenberg.js';
import { gutenbergIngestionService } from '../services/gutenbergIngestionService.js';
import { parsePositiveIntStrict, parseRouteGutenbergIdStrict } from '../utils/gutenbergId.js';
import { processBook } from '../services/bookProcessingService.js';
import { enqueueBookProcessing } from '../jobs/bookProcessingQueue.js';

const inFlightIngestionRequests = new Set();

const parseGutenbergRouteId = (value) => {
  return parseRouteGutenbergIdStrict(String(value || ''));
};

const buildErrorResponse = ({
  message,
  code,
  status = 'error',
  requestId,
  retryAfter,
}) => ({
  status,
  code,
  message,
  requestId,
  ...(Number.isFinite(retryAfter) ? { retryAfter } : {}),
});

const classifyUpstreamError = (error) => {
  const statusCode = Number(
    error?.statusCode
    || error?.response?.status
    || 0,
  );

  if (!statusCode) {
    return 'TRANSIENT';
  }

  if (statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500) {
    return 'TRANSIENT';
  }

  if (statusCode >= 400 && statusCode < 500) {
    return 'PERMANENT';
  }

  return 'TRANSIENT';
};

const fetchBookByRouteId = async (routeId, projection) => {
  const gutenbergId = parseGutenbergRouteId(routeId);
  if (gutenbergId != null) {
    return Book.findOne({ gutenbergId }).select(projection);
  }

  if (!mongoose.Types.ObjectId.isValid(routeId)) {
    return null;
  }

  return Book.findById(routeId).select(projection);
};

const createVirtualGutenbergBook = (routeId) => {
  const gutenbergId = parseGutenbergRouteId(routeId);
  if (gutenbergId == null) {
    return null;
  }

  return {
    title: `Project Gutenberg #${gutenbergId}`,
    author: 'Project Gutenberg',
    gutenbergId,
    sourceProvider: 'Project Gutenberg',
    sourceUrl: getGutenbergBookPageUrl(gutenbergId),
    rights: 'Public domain (Project Gutenberg)',
    coverImage: getGutenbergCoverUrl(gutenbergId, 'medium'),
    status: 'pending',
  };
};

const persistGutenbergBookIfMissing = async (gutenbergId, { enqueueIngestion = true, requestedBy = null } = {}) => {
  const existing = await Book.findOne({ gutenbergId });
  if (existing) {
    if (enqueueIngestion && existing.status !== 'ready') {
      await gutenbergIngestionService.enqueue(gutenbergId);
    }
    return existing;
  }

  const created = await gutenbergIngestionService.ensureBookRecord(gutenbergId, { status: 'pending', requestedBy });
  if (!created) {
    return null;
  }

  if (enqueueIngestion) {
    await gutenbergIngestionService.enqueue(gutenbergId);
  }

  return created;
};

export const getBooks = async (req, res) => {
  try {
    const page = Number.parseInt(String(req.query?.page ?? '1'), 10);
    const requestedLimit = Number.parseInt(String(req.query?.limit ?? '24'), 10);

    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(requestedLimit)
      ? Math.min(50, Math.max(1, requestedLimit))
      : 24;

    const totalBooks = await Book.countDocuments({});
    const allBooks = await Book.find({}).select('title author gutenbergId status chapters').lean();
    console.log('[BOOK] total documents:', totalBooks);
    console.log('[BOOK] full books query result:', allBooks);

    const [books, totalCount] = await Promise.all([
      Book.find({})
        .select('-textContent -chapters')
        .sort({ title: 1, _id: 1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Book.countDocuments({}),
    ]);

    res.setHeader('X-Page', String(safePage));
    res.setHeader('X-Limit', String(safeLimit));
    res.setHeader('X-Total-Count', String(totalCount));
    res.setHeader('X-Has-More', String(safePage * safeLimit < totalCount));
    res.json(books);
  } catch (error) {
    console.error('[BOOK] Failed to fetch books list:', error?.message || error);
    res.status(500).json({ message: 'Server error fetching books.' });
  }
};

export const getBookById = async (req, res) => {
  try {
    let book = await fetchBookByRouteId(req.params.id, '-textContent -chapters');
    if (!book) {
      const gutenbergId = parseGutenbergRouteId(req.params.id);
      if (gutenbergId != null) {
        await persistGutenbergBookIfMissing(gutenbergId, { enqueueIngestion: true });
        book = await fetchBookByRouteId(req.params.id, '-textContent -chapters');
      }
    }

    if (book) {
      res.json(book);
    } else {
      const virtualBook = createVirtualGutenbergBook(req.params.id);
      if (virtualBook) {
        res.json(virtualBook);
        return;
      }

      res.status(404).json({ message: 'Book not found' });
    }
  } catch {
    const virtualBook = createVirtualGutenbergBook(req.params.id);
    if (virtualBook) {
      res.json(virtualBook);
      return;
    }

    res.status(500).json({ message: 'Server error fetching book' });
  }
};

export const getBookContent = async (req, res) => {
  const routeBookId = req.params.id;
  const gutenbergIdFromRoute = parseGutenbergRouteId(routeBookId);

  const buildRemoteGutenbergResponse = async (gutenbergId) => {
    const rawText = await fetchGutenbergText(gutenbergId);
    const mainText = stripGutenbergBoilerplate(rawText);
    const chapters = convertTextToChapters(mainText, { fallbackTitle: 'Chapter' });

    return {
      chapters,
      sourceProvider: 'Project Gutenberg',
      sourceUrl: getGutenbergBookPageUrl(gutenbergId),
      rights: 'Public domain (Project Gutenberg)',
      gutenbergId,
    };
  };

  try {
    let book = await fetchBookByRouteId(routeBookId, 'chapters sourceProvider sourceUrl rights gutenbergId title author coverImage synopsis status ingestionError');
    if (!book && gutenbergIdFromRoute != null) {
      await persistGutenbergBookIfMissing(gutenbergIdFromRoute, { enqueueIngestion: true });
      book = await fetchBookByRouteId(routeBookId, 'chapters sourceProvider sourceUrl rights gutenbergId title author coverImage synopsis status ingestionError');
    }

    if (!book) {
      if (gutenbergIdFromRoute != null) {
        try {
          const remoteBook = await buildRemoteGutenbergResponse(gutenbergIdFromRoute);
          res.json(remoteBook);
          return;
        } catch (error) {
          console.error(`[BOOK] Failed to fetch Gutenberg book for route id ${routeBookId}:`, error?.message || error);
        }
      }

      res.status(404).json({ message: 'Book not found' });
      return;
    }

    const chapters = Array.isArray(book.chapters) ? book.chapters : [];
    const hasChapters = chapters.length > 0;

    if (!hasChapters && book.gutenbergId) {
      if (book.status === 'pending' || book.status === 'processing') {
        await gutenbergIngestionService.enqueue(book.gutenbergId);
        res.status(202).json({
          chapters: [],
          status: book.status,
          sourceProvider: book.sourceProvider || 'Project Gutenberg',
          sourceUrl: book.sourceUrl || getGutenbergBookPageUrl(book.gutenbergId),
          rights: book.rights || 'Public domain (Project Gutenberg)',
          gutenbergId: book.gutenbergId,
        });
        return;
      }

      try {
        const remoteBook = await buildRemoteGutenbergResponse(book.gutenbergId);

        book.chapters = remoteBook.chapters;
        book.sourceUrl = remoteBook.sourceUrl;
        book.coverImage = book.coverImage || getGutenbergCoverUrl(book.gutenbergId, 'medium');
        book.rights = book.rights || remoteBook.rights;
        book.sourceProvider = book.sourceProvider || remoteBook.sourceProvider;
        book.textContent = remoteBook.chapters.map((chapter) => chapter.chapter_text || '').join('\n\n');
        book.status = 'ready';
        book.ingestionError = null;
        await book.save();

        res.json({
          chapters: remoteBook.chapters,
          sourceProvider: book.sourceProvider,
          sourceUrl: book.sourceUrl,
          rights: book.rights,
          gutenbergId: book.gutenbergId,
          status: 'ready',
        });
        return;
      } catch (error) {
        console.error(`[BOOK] Failed to lazily ingest Gutenberg book ${book.title} (${book.gutenbergId}):`, error?.message || error);
        book.status = 'failed';
        book.ingestionError = String(error?.message || error);
        await book.save();
      }
    }

    if (!hasChapters) {
      res.status(book.status === 'pending' || book.status === 'processing' ? 202 : 503).json({
        chapters: [],
        status: book.status || 'pending',
        sourceProvider: book.sourceProvider || 'Project Gutenberg',
        sourceUrl: book.sourceUrl || (book.gutenbergId ? getGutenbergBookPageUrl(book.gutenbergId) : undefined),
        rights: book.rights || 'Public domain (Project Gutenberg)',
        gutenbergId: book.gutenbergId,
        message: book.status === 'failed'
          ? 'Failed to ingest this book. Please request ingestion again.'
          : 'Book ingestion is still in progress.',
      });
      return;
    }

    res.json({
      chapters,
      sourceProvider: book.sourceProvider,
      sourceUrl: book.sourceUrl,
      rights: book.rights,
      gutenbergId: book.gutenbergId,
      status: book.status || 'ready',
    });
  } catch {
    if (gutenbergIdFromRoute != null) {
      try {
        const remoteBook = await buildRemoteGutenbergResponse(gutenbergIdFromRoute);
        res.json(remoteBook);
        return;
      } catch (error) {
        console.error(`[BOOK] Failed to load Gutenberg fallback for ${routeBookId}:`, error?.message || error);
      }
    }

    res.status(500).json({ message: 'Server error fetching book content' });
  }
};

export const previewBookRequest = async (req, res) => {
  const gutenbergId = parsePositiveIntStrict(req.params.gutenbergId);
  if (!gutenbergId) {
    res.status(400).json(buildErrorResponse({
      message: 'Invalid Gutenberg ID.',
      code: 'INVALID_GUTENBERG_ID',
      requestId: req.requestId,
    }));
    return;
  }

  try {
    const preview = await gutenbergIngestionService.fetchPreview(gutenbergId);
    if (!preview) {
      console.warn('[FIND_BOOK_BACKEND]', { action: 'preview', gutenbergId, outcome: 'not_found', requestId: req.requestId });
      res.status(404).json(buildErrorResponse({
        message: 'Book not found on Gutendex.',
        code: 'BOOK_NOT_FOUND',
        requestId: req.requestId,
      }));
      return;
    }

    res.json({
      gutenbergId: preview.gutenbergId,
      title: preview.title,
      author: preview.author,
      cover: preview.coverImage,
    });
    console.info('[FIND_BOOK_BACKEND]', { action: 'preview', gutenbergId, outcome: 'success', requestId: req.requestId });
  } catch (error) {
    console.error(`[BOOK] Failed to preview Gutenberg ${gutenbergId}:`, error?.message || error, { requestId: req.requestId });
    if (classifyUpstreamError(error) === 'TRANSIENT') {
      console.warn('[FIND_BOOK_BACKEND]', { action: 'preview', gutenbergId, outcome: 'loading', requestId: req.requestId });
      res.status(503).json(buildErrorResponse({
        status: 'loading',
        message: 'Preview data is still warming up.',
        code: 'UPSTREAM_WARMING',
        retryAfter: 2,
        requestId: req.requestId,
      }));
      return;
    }

    res.status(502).json(buildErrorResponse({
      message: 'Failed to fetch preview from Gutendex.',
      code: 'PREVIEW_FETCH_FAILED',
      requestId: req.requestId,
    }));
    console.error('[FIND_BOOK_BACKEND]', { action: 'preview', gutenbergId, outcome: 'error', requestId: req.requestId });
  }
};

export const requestBookIngestion = async (req, res) => {
  const gutenbergId = parsePositiveIntStrict(req.body?.gutenbergId);
  if (!gutenbergId) {
    res.status(400).json(buildErrorResponse({
      message: 'Invalid Gutenberg ID.',
      code: 'INVALID_GUTENBERG_ID',
      requestId: req.requestId,
    }));
    return;
  }

  if (inFlightIngestionRequests.has(gutenbergId)) {
    res.status(202).json({ status: 'processing' });
    return;
  }

  inFlightIngestionRequests.add(gutenbergId);

  try {
    console.info('[FIND_BOOK_BACKEND]', { action: 'request', gutenbergId, outcome: 'received', requestId: req.requestId || 'n/a' });
    console.info(`[BOOK_REQUEST] received gutenbergId=${gutenbergId} requestId=${req.requestId || 'n/a'}`);

    const existing = await Book.findOne({ gutenbergId })
      .select('status retryCount _id gutenbergId title author coverImage')
      .lean();

    if (existing) {
      console.info(`[BOOK_REQUEST] skip existing gutenbergId=${gutenbergId} status=${existing.status}`);

      if (existing.status === 'pending' || existing.status === 'processing') {
        await gutenbergIngestionService.enqueue(gutenbergId);
        console.info('[FIND_BOOK_BACKEND]', { action: 'request', gutenbergId, outcome: 'processing', requestId: req.requestId || 'n/a' });
        res.status(202).json({ status: 'processing' });
        return;
      }

      if (existing.status === 'failed') {
        const queued = await gutenbergIngestionService.enqueue(gutenbergId);
        if (queued) {
          console.info('[FIND_BOOK_BACKEND]', { action: 'request', gutenbergId, outcome: 'requeued_failed', requestId: req.requestId || 'n/a' });
          res.status(202).json({ status: 'processing' });
          return;
        }
      }

      console.info('[FIND_BOOK_BACKEND]', { action: 'request', gutenbergId, outcome: 'already_exists', requestId: req.requestId || 'n/a' });
      res.json({
        status: 'already_exists',
        book: existing,
      });
      return;
    }

    const maybeUserId = req.user?._id || null;
    const requestedBy = maybeUserId && mongoose.Types.ObjectId.isValid(maybeUserId)
      ? maybeUserId
      : null;

    let book;
    try {
      book = await gutenbergIngestionService.ensureBookRecord(gutenbergId, { status: 'pending', requestedBy });
    } catch (error) {
      if (classifyUpstreamError(error) !== 'TRANSIENT') {
        throw error;
      }

      book = await Book.findOneAndUpdate(
        { gutenbergId },
        {
          $setOnInsert: {
            title: `Project Gutenberg #${gutenbergId}`,
            author: 'Project Gutenberg',
            sourceProvider: 'Project Gutenberg',
            sourceUrl: getGutenbergBookPageUrl(gutenbergId),
            rights: 'Public domain (Project Gutenberg)',
            requestedAt: new Date(),
          },
          $set: {
            status: 'pending',
            ...(requestedBy ? { requestedBy, requestedAt: new Date() } : {}),
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );
    }
    if (!book) {
      res.status(404).json(buildErrorResponse({
        message: 'Book not found on Gutendex.',
        code: 'BOOK_NOT_FOUND',
        requestId: req.requestId,
      }));
      return;
    }

    await gutenbergIngestionService.enqueue(gutenbergId);
    console.info(`[BOOK_REQUEST] completed gutenbergId=${gutenbergId} status=pending`);
    console.info('[FIND_BOOK_BACKEND]', { action: 'request', gutenbergId, outcome: 'processing', requestId: req.requestId || 'n/a' });

    res.status(202).json({
      status: 'processing',
      book,
    });
  } catch (error) {
    console.error(`[BOOK] Failed to request Gutenberg ${gutenbergId}:`, error?.message || error, { requestId: req.requestId });
    if (classifyUpstreamError(error) === 'TRANSIENT') {
      console.warn('[FIND_BOOK_BACKEND]', { action: 'request', gutenbergId, outcome: 'loading', requestId: req.requestId || 'n/a' });
      res.status(503).json(buildErrorResponse({
        status: 'loading',
        message: 'Ingestion service is warming up. Please retry shortly.',
        code: 'INGESTION_WARMING',
        retryAfter: 2,
        requestId: req.requestId,
      }));
      return;
    }

    res.status(500).json(buildErrorResponse({
      message: 'Failed to create request for this Gutenberg book.',
      code: 'INGESTION_REQUEST_FAILED',
      requestId: req.requestId,
    }));
    console.error('[FIND_BOOK_BACKEND]', { action: 'request', gutenbergId, outcome: 'error', requestId: req.requestId || 'n/a' });
  } finally {
    inFlightIngestionRequests.delete(gutenbergId);
  }
};


const buildReadResponse = (book) => ({
  _id: book._id,
  title: book.title,
  author: book.author,
  gutenbergId: book.gutenbergId,
  sourceProvider: book.sourceProvider,
  sourceUrl: book.sourceUrl,
  rights: book.rights,
  chapters: Array.isArray(book.chapters) ? book.chapters : [],
  status: book.processingStatus || {
    state: book.status === 'pending' ? 'not_started' : (book.status || 'not_started'),
    lastProcessedAt: null,
    errorMessage: book.ingestionError || null,
  },
});

export const readBook = async (req, res) => {
  try {
    const book = await fetchBookByRouteId(req.params.id, null);
    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    const hasChapters = Array.isArray(book.chapters) && book.chapters.length > 0;
    if (hasChapters) {
      res.json(buildReadResponse(book));
      return;
    }

    const backgroundRequested = String(req.query?.background || '').toLowerCase() === 'true';
    if (backgroundRequested) {
      await Book.updateOne(
        { _id: book._id },
        {
          $set: {
            status: 'processing',
            processingStatus: {
              state: 'processing',
              lastProcessedAt: book.processingStatus?.lastProcessedAt,
              errorMessage: null,
            },
            ingestionError: null,
          },
        },
      );
      enqueueBookProcessing(book._id);
      const pending = await Book.findById(book._id);
      res.status(202).json(buildReadResponse(pending));
      return;
    }

    const processed = await processBook(book._id);
    res.json(buildReadResponse(processed));
  } catch (error) {
    const message = String(error?.message || error);
    const statusCode = Number(error?.statusCode) || 500;

    console.error(`[BOOK_READ] Failed to load book ${req.params.id}:`, message);
    res.status(statusCode).json({
      message: 'Unable to process this book for reading right now.',
      details: message,
    });
  }
};

export const reprocessBook = async (req, res) => {
  try {
    const book = await fetchBookByRouteId(req.params.id, null);
    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    await Book.updateOne(
      { _id: book._id },
      {
        $set: {
          chapters: [],
          status: 'pending',
          ingestionError: null,
          processingStatus: {
            state: 'not_started',
            errorMessage: null,
          },
        },
      },
    );

    const refreshed = await Book.findById(book._id);
    const processed = await processBook(refreshed._id);
    res.json(buildReadResponse(processed));
  } catch (error) {
    const message = String(error?.message || error);
    console.error(`[BOOK_REPROCESS] Failed for ${req.params.id}:`, message);
    res.status(500).json({
      message: 'Reprocessing failed.',
      details: message,
    });
  }
};

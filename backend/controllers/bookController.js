import { Book } from '../models/Book.js';
import {
  convertTextToChapters,
  fetchGutenbergText,
  getGutenbergBookPageUrl,
  getGutenbergCoverUrl,
  stripGutenbergBoilerplate,
} from '../utils/gutenberg.js';
import { gutenbergIngestionService, parsePositiveInt } from '../services/gutenbergIngestionService.js';

const parseGutenbergRouteId = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^g?(\d+)$/);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
};

const fetchBookByRouteId = async (routeId, projection) => {
  const gutenbergId = parseGutenbergRouteId(routeId);
  if (gutenbergId != null) {
    return Book.findOne({ gutenbergId }).select(projection);
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
      gutenbergIngestionService.enqueue(gutenbergId);
    }
    return existing;
  }

  const created = await gutenbergIngestionService.ensureBookRecord(gutenbergId, { status: 'pending', requestedBy });
  if (!created) {
    return null;
  }

  if (enqueueIngestion) {
    gutenbergIngestionService.enqueue(gutenbergId);
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

    const [books, totalCount] = await Promise.all([
      Book.find({ status: { $ne: 'failed' } })
        .select('-textContent -chapters')
        .sort({ title: 1, _id: 1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Book.countDocuments({ status: { $ne: 'failed' } }),
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
      if (book.status === 'pending') {
        gutenbergIngestionService.enqueue(book.gutenbergId);
        res.status(202).json({
          chapters: [],
          status: 'pending',
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
      res.status(book.status === 'pending' ? 202 : 503).json({
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
  const gutenbergId = parsePositiveInt(req.params.gutenbergId);
  if (!gutenbergId) {
    res.status(400).json({ message: 'Invalid Gutenberg ID.' });
    return;
  }

  try {
    const preview = await gutenbergIngestionService.fetchPreview(gutenbergId);
    if (!preview) {
      res.status(404).json({ message: 'Book not found on Gutendex.' });
      return;
    }

    res.json({
      gutenbergId: preview.gutenbergId,
      title: preview.title,
      author: preview.author,
      cover: preview.coverImage,
    });
  } catch (error) {
    console.error(`[BOOK] Failed to preview Gutenberg ${gutenbergId}:`, error?.message || error);
    res.status(502).json({ message: 'Failed to fetch preview from Gutendex.' });
  }
};

export const requestBookIngestion = async (req, res) => {
  const gutenbergId = parsePositiveInt(req.body?.gutenbergId);
  if (!gutenbergId) {
    res.status(400).json({ message: 'Invalid Gutenberg ID.' });
    return;
  }

  try {
    const existing = await Book.findOne({ gutenbergId }).select('status _id gutenbergId title author coverImage');
    if (existing?.status === 'ready') {
      res.json({
        message: 'Book is already available.',
        status: 'ready',
        book: existing,
      });
      return;
    }

    if (existing?.status === 'pending') {
      gutenbergIngestionService.enqueue(gutenbergId);
      res.json({
        message: 'Book request already pending.',
        status: 'pending',
        book: existing,
      });
      return;
    }

    const requestedBy = req.user?._id || null;
    const book = await gutenbergIngestionService.ensureBookRecord(gutenbergId, { status: 'pending', requestedBy });
    if (!book) {
      res.status(404).json({ message: 'Book not found on Gutendex.' });
      return;
    }

    gutenbergIngestionService.enqueue(gutenbergId);

    res.status(202).json({
      message: existing?.status === 'failed' ? 'Book re-requested. Ingestion restarted.' : 'Book request accepted.',
      status: 'pending',
      book: {
        _id: book._id,
        gutenbergId: book.gutenbergId,
        title: book.title,
        author: book.author,
        coverImage: book.coverImage,
      },
    });
  } catch (error) {
    console.error(`[BOOK] Failed to request Gutenberg ${gutenbergId}:`, error?.message || error);
    res.status(500).json({ message: 'Failed to create request for this Gutenberg book.' });
  }
};

import { Book } from '../models/Book.js';
import mongoose from 'mongoose';
import {
  parseStrictGutenbergId,
  readGutenbergBookStateless,
  fetchGutenbergMetadata,
} from '../utils/gutenbergReader.js';
import { gutenbergCatalog } from '../seed/gutenbergCatalog.js';
import { isDegradedMode } from '../utils/degradedMode.js';
import {
  aggregateBookSearch,
  readBookFromSource,
  splitCompositeSourceId,
  SOURCE_NAMES,
} from '../services/bookAggregationService.js';
import { User } from '../models/User.js';
import { getDefaultTopBooks } from '../services/personalizedLibraryService.js';

const BACKEND_TIMEOUT_MS = 70_000;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_THROTTLE_MS = 450;
let lastRemoteSearchAt = 0;
const searchCache = new Map();
const metadataCache = new Map();
const inflightMetadata = new Map();
const fallbackBooks = [
  { gutenbergId: 1342, title: 'Pride and Prejudice', author: 'Jane Austen' },
  { gutenbergId: 11, title: 'Alice in Wonderland', author: 'Lewis Carroll' },
  { gutenbergId: 84, title: 'Frankenstein', author: 'Mary Shelley' },
];

const toStableBookShape = (book) => {
  const gutenbergId = Number(book?.gutenbergId);
  if (!Number.isFinite(gutenbergId) || gutenbergId <= 0) {
    return null;
  }

  const objectId = book?._id ? String(book._id) : null;
  return {
    ...book,
    id: objectId || `gutenberg:${gutenbergId}`,
    _id: objectId || null,
    gutenbergId,
    title: String(book?.title || 'Untitled'),
    author: String(book?.author || 'Unknown author'),
  };
};

const parseOptionalPositiveInt = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : fallback;
};

const buildReaderOptions = (req) => {
  const cursor = parseOptionalPositiveInt(req.query?.cursor, 0);
  const maxChapters = parseOptionalPositiveInt(req.query?.maxChapters, null);
  const processingBudgetMs = parseOptionalPositiveInt(req.query?.processingBudgetMs, 40_000);
  return {
    cursor,
    maxChapters,
    processingBudgetMs,
    timeoutMs: BACKEND_TIMEOUT_MS,
  };
};

const mapReadErrorMessage = (statusCode) => {
  if (statusCode === 404) return 'Unable to fetch this book. Check the ID.';
  if (statusCode === 504) return 'This book is large and taking longer than expected.';
  return 'Unable to fetch this book right now. Please retry.';
};

const readFreshCache = (cache, key) => {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  return cached.value;
};

const writeCache = (cache, key, value) => {
  cache.set(key, { value, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeSearchResult = (book) => toStableBookShape({
  ...book,
  gutenbergId: Number(book?.gutenbergId || book?.id),
});

const fetchMetadataSingleFlight = async (gutenbergId) => {
  const id = Number(gutenbergId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('Invalid Gutenberg ID.');
    error.statusCode = 400;
    throw error;
  }

  const cached = readFreshCache(metadataCache, id);
  if (cached) return cached;

  const existing = inflightMetadata.get(id);
  if (existing) return existing;

  const request = (async () => {
    const waitMs = Math.max(0, SEARCH_THROTTLE_MS - (Date.now() - lastRemoteSearchAt));
    if (waitMs > 0) await sleep(waitMs);
    lastRemoteSearchAt = Date.now();

    const payload = await fetchGutenbergMetadata(id, { timeoutMs: 15_000 });
    const normalized = normalizeSearchResult(payload);
    if (!normalized) {
      const error = new Error('Unable to fetch this Gutenberg book.');
      error.statusCode = 404;
      throw error;
    }
    writeCache(metadataCache, id, normalized);
    return normalized;
  })().finally(() => {
    inflightMetadata.delete(id);
  });

  inflightMetadata.set(id, request);
  return request;
};

const fetchBookByObjectId = async (routeId, projection = null) => {
  if (!mongoose.Types.ObjectId.isValid(routeId)) {
    return null;
  }

  return Book.findById(routeId).select(projection);
};

const upsertMetadata = async ({ gutenbergId, title, author }) => {
  const book = await Book.findOneAndUpdate(
    { gutenbergId },
    {
      $set: {
        title,
        author,
        gutenbergId,
        lastAccessedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).select('_id title author gutenbergId');

  return book;
};

export const getBooks = async (req, res) => {
  try {
    if (isDegradedMode()) {
      return res.json(fallbackBooks.map((book) => toStableBookShape(book)).filter(Boolean));
    }

    const books = await Book.find({})
      .select('_id title author gutenbergId')
      .sort({ lastAccessedAt: -1, _id: -1 })
      .lean();

    res.json(books.map((book) => toStableBookShape(book)).filter(Boolean));
  } catch (error) {
    console.error('[BOOK] Failed to fetch books list:', error?.message || error);
    res.status(500).json({ message: 'Server error fetching books.' });
  }
};

export const getLibraryFeed = async (req, res) => {
  try {
    const defaultBooks = getDefaultTopBooks();
    if (!req.user?._id) {
      console.info('[PERSONALIZATION] Library feed requested without authenticated user. Returning default top books.');
      return res.json({ books: defaultBooks, personalized: false, fallback: true });
    }

    const user = await User.findById(req.user._id)
      .select('preferredGenres hasPersonalization recommendedBooks recommendationsGeneratedAt')
      .lean();
    const personalizedBooks = Array.isArray(user?.recommendedBooks) ? user.recommendedBooks : [];
    const usePersonalized = Boolean(user?.hasPersonalization) && personalizedBooks.length > 0;
    const finalBooks = usePersonalized ? personalizedBooks.slice(0, 50) : defaultBooks;
    console.info('[PERSONALIZATION] Final library feed payload:', {
      userId: String(req.user._id),
      preferredGenres: Array.isArray(user?.preferredGenres) ? user.preferredGenres : [],
      usePersonalized,
      personalizedBooksCount: personalizedBooks.length,
      finalBooksCount: finalBooks.length,
      finalBooks,
      fallback: !usePersonalized,
      generatedAt: user?.recommendationsGeneratedAt || null,
    });

    return res.json({
      books: finalBooks,
      preferredGenres: Array.isArray(user?.preferredGenres) ? user.preferredGenres : [],
      personalized: usePersonalized,
      fallback: !usePersonalized,
      generatedAt: user?.recommendationsGeneratedAt || null,
    });
  } catch (error) {
    console.error('[BOOK] Failed to fetch library feed:', error?.message || error);
    return res.json({ books: getDefaultTopBooks(), personalized: false, fallback: true });
  }
};

export const searchGutenbergBooks = async (req, res) => {
  try {
    const query = String(req.query?.q || '').trim().toLowerCase();
    if (!query) {
      return res.json({ results: [] });
    }

    const cached = readFreshCache(searchCache, query);
    if (cached) return res.json({ results: cached });

    const catalogSource = Array.isArray(gutenbergCatalog) && gutenbergCatalog.length > 0
      ? gutenbergCatalog
      : fallbackBooks;
    const localGutenbergResults = catalogSource
      .filter((book) => {
        const idString = String(book?.gutenbergId || '');
        const title = String(book?.title || '').toLowerCase();
        const author = String(book?.author || '').toLowerCase();
        return title.includes(query) || author.includes(query) || idString === query;
      })
      .slice(0, 30)
      .map((book) => toStableBookShape(book))
      .filter(Boolean)
      .map((book) => ({
        ...book,
        source: SOURCE_NAMES.SOURCE_GUTENBERG,
        sourceId: String(book.gutenbergId),
        coverImage: `https://www.gutenberg.org/cache/epub/${book.gutenbergId}/pg${book.gutenbergId}.cover.medium.jpg`,
      }));

    let aggregated = await aggregateBookSearch(query);
    if (aggregated.length === 0 && /^\d+$/.test(query)) {
      try {
        const remoteBook = await fetchMetadataSingleFlight(Number(query));
        if (remoteBook) {
          aggregated = [{
            ...remoteBook,
            source: SOURCE_NAMES.SOURCE_GUTENBERG,
            sourceId: String(remoteBook.gutenbergId),
            coverImage: `https://www.gutenberg.org/cache/epub/${remoteBook.gutenbergId}/pg${remoteBook.gutenbergId}.cover.medium.jpg`,
          }];
        }
      } catch (error) {
        if (Number(error?.statusCode) !== 404 && Number(error?.statusCode) !== 400) {
          throw error;
        }
      }
    }

    const results = Array.from(
      new Map(
        [...localGutenbergResults, ...aggregated].map((book) => [String(book?.id || `${book?.source}:${book?.sourceId}`), book]),
      ).values(),
    );

    writeCache(searchCache, query, results);

    return res.json({ results });
  } catch (error) {
    console.error('[BOOK] Failed to search Gutenberg books:', error?.message || error);
    return res.status(500).json({ message: 'Server error searching Gutenberg books.' });
  }
};

export const getBookById = async (req, res) => {
  try {
    if (isDegradedMode()) {
      return res.status(503).json({ message: 'Book metadata lookup unavailable in degraded mode.', fallback: true });
    }

    const book = await fetchBookByObjectId(req.params.id, 'title author gutenbergId');
    if (!book) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }

    res.json(book);
  } catch (error) {
    console.error('[BOOK] Failed to fetch book by id:', error?.message || error);
    res.status(500).json({ message: 'Server error fetching book' });
  }
};

export const readBook = async (req, res) => {
  try {
    if (isDegradedMode()) {
      return res.status(503).json({ message: 'Book reading by database id is unavailable in degraded mode.', fallback: true });
    }

    const book = await fetchBookByObjectId(req.params.id, 'title author gutenbergId');
    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    const payload = await readGutenbergBookStateless(book.gutenbergId, buildReaderOptions(req));
    const persisted = await upsertMetadata({
      gutenbergId: payload.gutenbergId,
      title: payload.title,
      author: payload.author,
    });
    const responseData = {
      ...payload,
      bookId: persisted?._id ? String(persisted._id) : String(book._id),
      source: SOURCE_NAMES.SOURCE_GUTENBERG,
      sourceId: String(payload.gutenbergId),
    };
    res.json({
      ...responseData,
      success: true,
      data: {
        title: responseData.title,
        author: responseData.author,
        chapters: Array.isArray(responseData.chapters) ? responseData.chapters : [],
      },
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({
      message: mapReadErrorMessage(statusCode),
    });
  }
};


export const getGutenbergPreview = async (req, res) => {
  try {
    const gutenbergId = parseStrictGutenbergId(req.params.gutenbergId);
    if (!gutenbergId) {
      res.status(400).json({ message: 'Invalid Gutenberg ID.' });
      return;
    }

    if (!isDegradedMode()) {
      const existing = await Book.findOne({ gutenbergId })
        .select('_id title author gutenbergId')
        .lean();

      if (existing) {
        res.json(existing);
        return;
      }
    }

    const catalogEntry = (Array.isArray(gutenbergCatalog) ? gutenbergCatalog : [])
      .find((book) => Number(book?.gutenbergId) === gutenbergId);

    if (catalogEntry) {
      return res.json({
        gutenbergId,
        title: catalogEntry.title || 'Untitled',
        author: catalogEntry.author || 'Unknown author',
      });
    }

    const remoteBook = await fetchMetadataSingleFlight(gutenbergId);
    return res.json(remoteBook);
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    if (statusCode === 404) {
      return res.status(404).json({ message: 'Book preview not found for this Gutenberg ID.' });
    }
    console.error('[BOOK] Failed to fetch Gutenberg preview:', error?.message || error);
    return res.status(500).json({ message: 'Server error fetching Gutenberg preview.' });
  }
};

export const readGutenbergBook = async (req, res) => {
  try {
    const gutenbergId = parseStrictGutenbergId(req.params.gutenbergId);
    if (!gutenbergId) {
      res.status(400).json({ message: 'Invalid Gutenberg ID.' });
      return;
    }

    const payload = await readGutenbergBookStateless(gutenbergId, buildReaderOptions(req));
    const persisted = isDegradedMode()
      ? null
      : await upsertMetadata({
          gutenbergId: payload.gutenbergId,
          title: payload.title,
          author: payload.author,
        });
    const responseData = {
      ...payload,
      bookId: persisted?._id ? String(persisted._id) : `gutenberg:${payload.gutenbergId}`,
      fallback: isDegradedMode(),
      source: SOURCE_NAMES.SOURCE_GUTENBERG,
      sourceId: String(payload.gutenbergId),
    };
    res.json({
      ...responseData,
      success: true,
      data: {
        title: responseData.title,
        author: responseData.author,
        chapters: Array.isArray(responseData.chapters) ? responseData.chapters : [],
      },
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({
      message: mapReadErrorMessage(statusCode),
    });
  }
};

export const searchBooks = async (req, res) => searchGutenbergBooks(req, res);

export const readBookBySource = async (req, res) => {
  const sourceParam = String(req.query?.source || '').trim().toLowerCase();
  const idParam = String(req.query?.id || '').trim();
  const composite = splitCompositeSourceId(idParam);
  const source = sourceParam || composite?.source || '';
  const sourceId = composite?.sourceId || idParam;

  if (!source || !sourceId) {
    return res.status(400).json({
      message: 'Both source and id are required.',
      success: false,
      data: { title: 'Unavailable', author: 'Unknown author', chapters: [{ index: 1, title: 'Unavailable', html: '<p>No readable source was provided.</p>' }] },
    });
  }

  try {
    const payload = await readBookFromSource({
      source,
      sourceId,
      readGutenbergBookStateless,
      buildReaderOptions: () => buildReaderOptions(req),
    });

    const chapters = Array.isArray(payload?.chapters) && payload.chapters.length > 0
      ? payload.chapters
      : [{ index: 1, title: 'Unavailable', html: '<p>No chapter content is available for this source.</p>' }];
    return res.json({
      success: true,
      source,
      sourceId,
      availability: payload?.availability || 'unknown',
      availabilityNote: payload?.availabilityNote || null,
      data: {
        title: String(payload?.title || 'Untitled'),
        author: String(payload?.author || 'Unknown author'),
        chapters,
        availability: payload?.availability || 'unknown',
        availabilityNote: payload?.availabilityNote || null,
      },
      title: String(payload?.title || 'Untitled'),
      author: String(payload?.author || 'Unknown author'),
      chapters,
      sourceUrl: payload?.sourceUrl || null,
    });
  } catch (error) {
    console.error('[BOOK] Source-aware read fallback triggered:', error?.message || error);
    return res.json({
      success: true,
      source,
      sourceId,
      data: {
        title: 'Preview unavailable',
        author: 'Unknown author',
        chapters: [{ index: 1, title: 'Fallback Preview', html: '<p>This source is temporarily unavailable. Please retry shortly.</p>' }],
      },
      title: 'Preview unavailable',
      author: 'Unknown author',
      chapters: [{ index: 1, title: 'Fallback Preview', html: '<p>This source is temporarily unavailable. Please retry shortly.</p>' }],
    });
  }
};

import mongoose from 'mongoose';
import { Book } from '../models/Book.js';
import { UserProgress } from '../models/UserProgress.js';
import { gutenbergCatalog } from '../seed/gutenbergCatalog.js';
import { recommendFromDatabase } from '../recommenderSystem/recommenderSystem.js';

const asStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (entry == null ? '' : String(entry)))
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeCatalogBook = (book) => ({
  _id: `catalog-${book.gutenbergId}`,
  gutenbergId: Number(book.gutenbergId),
  title: String(book.title || '').trim(),
  author: String(book.author || '').trim(),
});

const emptyShelves = () => ({
  based_on_book: [],
  same_author: [],
  series_continuation: [],
  genre_based: [],
  contentBased: [],
  popular: [],
});

const normalizeTitleTokens = (title) => String(title || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter((token) => token.length >= 4);

const scoreCandidate = (candidate, baseBook) => {
  let score = 0;

  const baseAuthor = String(baseBook?.author || '').trim().toLowerCase();
  const candidateAuthor = String(candidate?.author || '').trim().toLowerCase();
  if (baseAuthor && candidateAuthor && baseAuthor === candidateAuthor) {
    score += 4;
  }

  const baseTitleTokens = new Set(normalizeTitleTokens(baseBook?.title));
  const candidateTokens = new Set(normalizeTitleTokens(candidate?.title));
  for (const token of baseTitleTokens) {
    if (candidateTokens.has(token)) {
      score += 1;
    }
  }

  return score;
};

const buildRecommendations = ({ catalogBooks, baseBook, readGutenbergIds, limit }) => {
  const readSet = new Set((readGutenbergIds || []).map(Number));
  const unreadCandidates = catalogBooks.filter((book) => !readSet.has(Number(book.gutenbergId)));

  return unreadCandidates
    .map((book) => ({ book, score: scoreCandidate(book, baseBook) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.book.title || '').localeCompare(b.book.title || '');
    })
    .map((entry) => entry.book)
    .slice(0, Math.min(limit, 8));
};

const dedupeBooks = (books = []) => {
  const seen = new Set();
  return books.filter((book) => {
    const key = String(book?._id || book?.gutenbergId || `${book?.title || ''}-${book?.author || ''}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getPopularBooks = async ({ excludeIds = [], limit = 8 }) => {
  const excludedSet = new Set(excludeIds.map(String));

  const topProgress = await UserProgress.aggregate([
    { $group: { _id: '$bookId', reads: { $sum: 1 }, lastReadAt: { $max: '$updatedAt' } } },
    { $sort: { reads: -1, lastReadAt: -1 } },
    { $limit: Math.max(limit * 3, 20) },
  ]);

  const topIds = topProgress
    .map((entry) => String(entry?._id || ''))
    .filter((id) => id && !excludedSet.has(id));

  const booksByPopularity = topIds.length
    ? await Book.find({ _id: { $in: topIds } }).select('_id title author gutenbergId lastAccessedAt').lean()
    : [];
  const byId = new Map(booksByPopularity.map((book) => [String(book?._id || ''), book]));

  const sortedPopular = topIds
    .map((id) => byId.get(id))
    .filter(Boolean);

  if (sortedPopular.length >= limit) {
    return sortedPopular.slice(0, limit);
  }

  const fallbackRecent = await Book.find({})
    .select('_id title author gutenbergId lastAccessedAt')
    .sort({ lastAccessedAt: -1, _id: -1 })
    .limit(Math.max(limit * 2, 16))
    .lean();

  return dedupeBooks([...sortedPopular, ...fallbackRecent])
    .filter((book) => !excludedSet.has(String(book?._id || '')))
    .slice(0, limit);
};

export const getRecommendations = async (req, res) => {
  try {
    const requestBook = req.body?.book && typeof req.body.book === 'object' ? req.body.book : null;
    const limitPerShelf = Number.isFinite(Number(req.body?.limitPerShelf))
      ? Math.max(1, Math.min(20, Number(req.body.limitPerShelf)))
      : 8;

    const readBookIds = asStringArray(req.body?.readBookIds).slice(0, 120);
    const objectIds = readBookIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    const readBooks = await Book.find({ _id: { $in: objectIds } })
      .select('_id title author gutenbergId')
      .lean();

    const requestGutenbergId = Number(requestBook?.gutenbergId);
    const readGutenbergIds = readBooks
      .map((book) => Number(book?.gutenbergId))
      .filter((id) => Number.isFinite(id));

    const baseBook = {
      title: String(requestBook?.title || readBooks[0]?.title || '').trim(),
      author: String(requestBook?.author || readBooks[0]?.author || '').trim(),
      gutenbergId: Number.isFinite(requestGutenbergId) ? requestGutenbergId : null,
    };

    if (baseBook.gutenbergId && !readGutenbergIds.includes(baseBook.gutenbergId)) {
      readGutenbergIds.push(baseBook.gutenbergId);
    }

    const normalizedCatalog = (Array.isArray(gutenbergCatalog) ? gutenbergCatalog : [])
      .filter((book) => book && Number.isFinite(Number(book.gutenbergId)))
      .map(normalizeCatalogBook);

    const fallback = buildRecommendations({
      catalogBooks: normalizedCatalog,
      baseBook,
      readGutenbergIds,
      limit: limitPerShelf,
    });

    let recommendations = emptyShelves();
    let source = 'catalog-title-author';

    if (readBooks.length > 0) {
      const currentBookId = String(req.body?.currentBookId || readBooks[0]?._id || '').trim() || undefined;
      const dbRecommendations = await recommendFromDatabase({
        currentBookId,
        readBookIds: readBooks.map((book) => String(book?._id || '')).filter(Boolean),
        limitPerShelf,
      });

      const candidateIds = [
        ...(dbRecommendations?.based_on_book || []),
        ...(dbRecommendations?.same_author || []),
        ...(dbRecommendations?.series_continuation || []),
        ...(dbRecommendations?.genre_based || []),
      ].map((id) => String(id)).filter(Boolean);

      const dbBooks = candidateIds.length
        ? await Book.find({ _id: { $in: candidateIds } }).select('_id title author gutenbergId lastAccessedAt').lean()
        : [];
      const idLookup = new Map(dbBooks.map((book) => [String(book._id), book]));
      const mapIdsToBooks = (ids = []) => ids
        .map((id) => idLookup.get(String(id)))
        .filter(Boolean);

      const basedOnBook = mapIdsToBooks(dbRecommendations?.based_on_book);
      const sameAuthor = mapIdsToBooks(dbRecommendations?.same_author);
      const seriesContinuation = mapIdsToBooks(dbRecommendations?.series_continuation);
      const genreBased = mapIdsToBooks(dbRecommendations?.genre_based);

      const contentBased = dedupeBooks([
        ...basedOnBook,
        ...sameAuthor,
        ...seriesContinuation,
        ...genreBased,
      ]).slice(0, limitPerShelf);

      const popular = await getPopularBooks({
        excludeIds: [...readBookIds, ...contentBased.map((book) => String(book?._id || ''))],
        limit: limitPerShelf,
      });

      recommendations = {
        based_on_book: basedOnBook,
        same_author: sameAuthor,
        series_continuation: seriesContinuation,
        genre_based: genreBased,
        contentBased,
        popular,
      };
      source = 'database-content-popular';
    }

    if (!recommendations.based_on_book.length && fallback.length) {
      recommendations.based_on_book = fallback;
      recommendations.contentBased = dedupeBooks([
        ...recommendations.contentBased,
        ...fallback,
      ]).slice(0, limitPerShelf);
      source = 'catalog-title-author';
    }

    if (!recommendations.popular.length) {
      recommendations.popular = await getPopularBooks({
        excludeIds: [...readBookIds, ...recommendations.contentBased.map((book) => String(book?._id || ''))],
        limit: limitPerShelf,
      });
    }

    return res.json({
      currentBookId: req.body?.currentBookId || null,
      recommendations,
      source,
    });
  } catch (error) {
    console.error('[RECOMMENDER ERROR]', error);
    return res.status(200).json({
      currentBookId: req.body?.currentBookId || null,
      recommendations: emptyShelves(),
      source: 'error-fallback',
    });
  }
};

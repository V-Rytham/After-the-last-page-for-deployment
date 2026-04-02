import mongoose from 'mongoose';
import { recommendFromDatabase } from '../recommenderSystem/recommenderSystem.js';
import { Book } from '../models/Book.js';
import { gutenbergCatalog } from '../seed/gutenbergCatalog.js';
import { normalizeTags } from '../utils/tags.js';

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
  gutenbergId: book.gutenbergId,
  title: book.title,
  author: book.author,
  tags: normalizeTags(book.tags || []),
});

const scoreCatalogCandidate = (candidate, baseBook) => {
  const baseTags = new Set(normalizeTags(baseBook?.tags || []));
  const candidateTags = new Set(normalizeTags(candidate?.tags || []));
  let score = 0;

  if (baseBook?.author && candidate?.author && baseBook.author === candidate.author) {
    score += 4;
  }

  for (const tag of baseTags) {
    if (candidateTags.has(tag)) {
      score += 2;
    }
  }

  if ((candidate?.title || '').toLowerCase().includes((baseBook?.title || '').toLowerCase().split(':')[0] || '')) {
    score += 1;
  }

  return score;
};

const buildCatalogRecommendations = ({ catalogBooks, currentBook, readGutenbergIds, limit }) => {
  const readSet = new Set(readGutenbergIds);
  const unreadCandidates = catalogBooks.filter((book) => !readSet.has(book.gutenbergId));

  const scored = unreadCandidates
    .map((book) => ({ book, score: scoreCatalogCandidate(book, currentBook) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.book.title || '').localeCompare(b.book.title || '');
    })
    .map((entry) => entry.book);

  return scored.slice(0, Math.min(limit, 8));
};

const idsToBooks = async (recommendationIdsByShelf) => {
  const allIds = Object.values(recommendationIdsByShelf)
    .flatMap((ids) => (Array.isArray(ids) ? ids : []))
    .filter(Boolean);

  if (!allIds.length) {
    return recommendationIdsByShelf;
  }

  const objectIds = allIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const books = await Book.find({ _id: { $in: objectIds } })
    .select('_id title author gutenbergId')
    .lean();

  const byId = new Map(books.map((book) => [String(book._id), book]));

  return Object.fromEntries(
    Object.entries(recommendationIdsByShelf).map(([shelf, ids]) => {
      const mapped = (ids || []).map((id) => byId.get(String(id))).filter(Boolean);
      return [shelf, mapped];
    }),
  );
};

export const getRecommendations = async (req, res) => {
  try {
    const readBookIds = asStringArray(req.body?.readBookIds);
    const currentBookId = req.body?.currentBookId
      ? String(req.body.currentBookId)
      : (readBookIds[0] || '');

    const limitPerShelf = Number.isFinite(Number(req.body?.limitPerShelf))
      ? Math.max(1, Math.min(20, Number(req.body.limitPerShelf)))
      : 10;

    if (readBookIds.length > 120) {
      return res.status(400).json({ message: 'Too many readBookIds requested at once.' });
    }

    const readBooks = await Book.find({ _id: { $in: readBookIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) } })
      .select('_id title author gutenbergId')
      .lean();

    let resolvedFromDb = null;
    try {
      const recommendationsByShelf = await recommendFromDatabase({
        currentBookId,
        readBookIds,
        limitPerShelf,
      });

      resolvedFromDb = await idsToBooks(recommendationsByShelf || {});
      const flatResolved = Object.values(resolvedFromDb || {}).flat();

      if (flatResolved.length > 0) {
        return res.json({
          currentBookId: currentBookId || null,
          recommendations: resolvedFromDb,
          source: 'database',
        });
      }
    } catch (databaseError) {
      console.warn('[RECOMMENDER] Database recommendation path failed, using catalog fallback:', databaseError?.message || databaseError);
    }

    const normalizedCatalog = (Array.isArray(gutenbergCatalog) ? gutenbergCatalog : [])
      .filter((book) => book && Number.isFinite(Number(book.gutenbergId)))
      .map(normalizeCatalogBook);
    const readGutenbergIds = readBooks
      .map((book) => Number(book?.gutenbergId))
      .filter((id) => Number.isFinite(id));

    const currentRead = readBooks.find((book) => String(book._id) === currentBookId) || readBooks[0];
    const currentBook = normalizedCatalog.find((book) => book.gutenbergId === Number(currentRead?.gutenbergId)) || normalizedCatalog[0];

    const fallback = buildCatalogRecommendations({
      catalogBooks: normalizedCatalog,
      currentBook,
      readGutenbergIds,
      limit: Math.min(8, limitPerShelf),
    });

    return res.json({
      currentBookId: currentBookId || null,
      recommendations: {
        based_on_book: fallback,
        same_author: [],
        series_continuation: [],
        genre_based: [],
      },
      source: 'catalog-fallback',
    });
  } catch (error) {
    console.error('[RECOMMENDER] Failed to generate recommendations:', error?.message || error);
    return res.status(500).json({ message: 'Server error generating recommendations.' });
  }
};

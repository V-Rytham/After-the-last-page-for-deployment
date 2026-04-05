import { Book } from '../models/Book.js';
import { canonicalizeTag } from '../utils/tags.js';

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const BOOK_CACHE_TTL_MS = parsePositiveInt(process.env.RECOMMENDER_BOOK_CACHE_MS, 30_000);
let booksCache = {
  expiresAt: 0,
  books: null,
};

const normalizeTag = (tag) => {
  const canonical = canonicalizeTag(tag);
  return canonical ? canonical.toLowerCase() : '';
};

const asIdString = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value.toString === 'function') {
    return value.toString();
  }

  return String(value);
};

const getBookId = (book) => asIdString(book?._id || book?.id);

const toTagSet = (book) => new Set((book?.tags || []).map(normalizeTag).filter(Boolean));

const scoreTagOverlap = (baseTags, candidateTags) => {
  if (!baseTags.size || !candidateTags.size) {
    return 0;
  }

  let score = 0;
  for (const tag of baseTags) {
    if (candidateTags.has(tag)) {
      score += 1;
    }
  }
  return score;
};

const sortByScoreThenTitle = (a, b) => {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  return (a.title || '').localeCompare(b.title || '');
};

export const recommendForContext = (books, options = {}) => {
  const {
    currentBookId,
    readBookIds = [],
    limitPerShelf = 10,
    minTagScoreForStrongMatch = 2,
    minTagResultsForStrongMatch = 3,
  } = options;

  const baseId = asIdString(currentBookId);
  const readSet = new Set((readBookIds || []).map(asIdString).filter(Boolean));
  const used = new Set();

  const byId = new Map(books.map((book) => [getBookId(book), book]));
  const baseBook = baseId ? byId.get(baseId) : null;

  const exclude = (id) => {
    if (!id) return true;
    if (id === baseId) return true;
    if (readSet.has(id)) return true;
    return false;
  };

  const takeUnique = (ids) => {
    const picked = [];
    for (const id of ids) {
      if (!id || exclude(id) || used.has(id)) {
        continue;
      }
      used.add(id);
      picked.push(id);
      if (picked.length >= limitPerShelf) {
        break;
      }
    }
    return picked;
  };

  if (!baseBook) {
    return {
      based_on_book: [],
      same_author: [],
      series_continuation: [],
      genre_based: [],
    };
  }

  const candidates = books.filter((book) => !exclude(getBookId(book)));
  const baseTags = toTagSet(baseBook);

  const seriesContinuation = (() => {
    const series = (baseBook.series || '').trim();
    if (!series) {
      return [];
    }

    const seriesBooks = candidates
      .filter((book) => (book.series || '').trim() === series)
      .map((book) => ({
        id: getBookId(book),
        index: typeof book.seriesIndex === 'number' ? book.seriesIndex : Number.NaN,
        title: book.title,
      }))
      .filter((entry) => entry.id);

    if (!seriesBooks.length) {
      return [];
    }

    seriesBooks.sort((a, b) => {
      const aHas = Number.isFinite(a.index);
      const bHas = Number.isFinite(b.index);
      if (aHas && bHas && a.index !== b.index) {
        return a.index - b.index;
      }
      if (aHas !== bHas) {
        return aHas ? -1 : 1;
      }
      return (a.title || '').localeCompare(b.title || '');
    });

    const baseIndex = typeof baseBook.seriesIndex === 'number' ? baseBook.seriesIndex : Number.NaN;
    const next = Number.isFinite(baseIndex)
      ? seriesBooks.find((entry) => Number.isFinite(entry.index) && entry.index > baseIndex)
      : seriesBooks[0];

    return next?.id ? [next.id] : [];
  })();

  const tagSimilarityRanked = candidates
    .map((book) => {
      const score = scoreTagOverlap(baseTags, toTagSet(book));
      return { id: getBookId(book), score, title: book.title };
    })
    .filter((entry) => entry.id && entry.score > 0)
    .sort(sortByScoreThenTitle)
    .map((entry) => entry.id);

  const baseAuthor = (baseBook.author || '').trim();
  const authorRanked = baseAuthor
    ? candidates
        .filter((book) => (book.author || '').trim() === baseAuthor)
        .map((book) => ({
          id: getBookId(book),
          title: book.title,
          score: scoreTagOverlap(baseTags, toTagSet(book)),
        }))
        .filter((entry) => entry.id)
        .sort(sortByScoreThenTitle)
        .map((entry) => entry.id)
    : [];

  const primaryGenre = (baseBook.tags || []).map((tag) => tag?.toString().trim()).find(Boolean) || '';
  const genreRanked = primaryGenre
    ? candidates
        .filter((book) => (book.tags || []).some((tag) => normalizeTag(tag) === normalizeTag(primaryGenre)))
        .map((book) => ({ id: getBookId(book), title: book.title }))
        .filter((entry) => entry.id)
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        .map((entry) => entry.id)
    : [];

  const basedOnBook = takeUnique(tagSimilarityRanked);
  const sameAuthor = takeUnique(authorRanked);

  const strongestTagScore = (() => {
    if (!tagSimilarityRanked.length) {
      return 0;
    }

    const topId = tagSimilarityRanked[0];
    const top = topId ? byId.get(topId) : null;
    return top ? scoreTagOverlap(baseTags, toTagSet(top)) : 0;
  })();

  const tagMatchesStrong = basedOnBook.length >= minTagResultsForStrongMatch && strongestTagScore >= minTagScoreForStrongMatch;
  const genreBased = tagMatchesStrong ? [] : takeUnique(genreRanked);

  return {
    based_on_book: basedOnBook,
    same_author: sameAuthor,
    series_continuation: takeUnique(seriesContinuation),
    genre_based: genreBased,
  };
};

// Thin wrapper: loads only the fields needed for lightweight, content-based recs.
export const recommendFromDatabase = async (options = {}) => {
  const now = Date.now();
  const canUseCache = Array.isArray(booksCache.books) && booksCache.expiresAt > now;
  const books = canUseCache
    ? booksCache.books
    : await Book.find({})
      .select('_id title author tags series seriesIndex gutenbergId')
      .lean();

  if (!canUseCache) {
    booksCache = {
      books,
      expiresAt: now + BOOK_CACHE_TTL_MS,
    };
  }

  return recommendForContext(books, options);
};

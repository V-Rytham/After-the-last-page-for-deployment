import { User } from '../models/User.js';
import { Book } from '../models/Book.js';
import { UserProgress } from '../models/UserProgress.js';
import { gutenbergCatalog } from '../seed/gutenbergCatalog.js';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_RECOMMENDATIONS = 12;
const MIN_CF_BOOKS = 3;
const TOKEN_SPLIT_RE = /[^a-z0-9]+/i;

const recommendationCache = new Map();
const ctrStats = new Map();

const cosineSimilarity = (a, b) => {
  if (!a.size || !b.size) return 0;
  let dot = 0;
  for (const [token, valueA] of a.entries()) {
    dot += valueA * (b.get(token) || 0);
  }

  if (dot <= 0) return 0;

  const normA = Math.sqrt(Array.from(a.values()).reduce((sum, value) => sum + value ** 2, 0));
  const normB = Math.sqrt(Array.from(b.values()).reduce((sum, value) => sum + value ** 2, 0));

  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
};

const jaccardSimilarity = (a, b) => {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a.values()) {
    if (b.has(value)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const tokenize = (text) => String(text || '')
  .toLowerCase()
  .split(TOKEN_SPLIT_RE)
  .map((token) => token.trim())
  .filter((token) => token.length >= 3);

const toEmbedding = (book) => {
  const terms = [
    ...tokenize(book?.title),
    ...tokenize(book?.author),
    ...tokenize(book?.description),
    ...(Array.isArray(book?.genres) ? book.genres.flatMap(tokenize) : []),
    ...(Array.isArray(book?.tags) ? book.tags.flatMap(tokenize) : []),
  ];

  const vector = new Map();
  for (const term of terms) {
    vector.set(term, (vector.get(term) || 0) + 1);
  }
  return vector;
};

const safeDateValue = (value) => {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizePopularity = (count, maxCount) => {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(maxCount) || maxCount <= 0) {
    return 0;
  }
  return Math.min(0.12, (count / maxCount) * 0.12);
};

const normalizeRecency = (lastSeenAt, newestSeenAt) => {
  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0 || !Number.isFinite(newestSeenAt) || newestSeenAt <= 0) {
    return 0;
  }
  const ageDays = Math.max(0, (newestSeenAt - lastSeenAt) / (24 * 60 * 60 * 1000));
  return Math.max(0, 0.08 - Math.min(0.08, ageDays / 3650));
};

const getCatalogByGutenbergId = () => {
  const byId = new Map();
  for (const item of Array.isArray(gutenbergCatalog) ? gutenbergCatalog : []) {
    const id = Number(item?.gutenbergId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        tags: Array.isArray(item?.tags) ? item.tags : [],
      });
    }
  }
  return byId;
};

const catalogByGutenbergId = getCatalogByGutenbergId();

const buildBookFeatures = (book) => {
  const catalogMeta = catalogByGutenbergId.get(Number(book?.gutenbergId)) || null;
  const tags = Array.isArray(catalogMeta?.tags) ? catalogMeta.tags : [];

  return {
    ...book,
    genres: tags,
    tags,
    description: '',
    embedding: toEmbedding({ ...book, genres: tags, tags, description: '' }),
  };
};

const fetchBehaviorData = async () => {
  const [users, progressEntries, books] = await Promise.all([
    User.find({}).select('_id preferredGenres').lean(),
    UserProgress.find({}).select('userId bookId updatedAt createdAt score quizPassed').lean(),
    Book.find({}).select('_id title author gutenbergId lastAccessedAt').lean(),
  ]);

  const booksById = new Map(
    books.map((book) => [String(book._id), buildBookFeatures(book)]),
  );

  const userToBooks = new Map();
  const bookToUsers = new Map();
  const bookMetrics = new Map();

  for (const entry of progressEntries) {
    const userId = String(entry?.userId || '');
    const bookId = String(entry?.bookId || '');
    if (!userId || !bookId || !booksById.has(bookId)) continue;

    const userBooks = userToBooks.get(userId) || new Set();
    userBooks.add(bookId);
    userToBooks.set(userId, userBooks);

    const usersForBook = bookToUsers.get(bookId) || new Set();
    usersForBook.add(userId);
    bookToUsers.set(bookId, usersForBook);

    const metric = bookMetrics.get(bookId) || { popularity: 0, latestActivityAt: 0 };
    metric.popularity += 1;
    metric.latestActivityAt = Math.max(metric.latestActivityAt, safeDateValue(entry?.updatedAt || entry?.createdAt));
    bookMetrics.set(bookId, metric);
  }

  const newestSeenAt = Array.from(bookMetrics.values()).reduce((max, metric) => Math.max(max, metric.latestActivityAt), 0);
  const maxPopularity = Array.from(bookMetrics.values()).reduce((max, metric) => Math.max(max, metric.popularity), 0);

  return {
    users,
    userToBooks,
    bookToUsers,
    booksById,
    bookMetrics,
    newestSeenAt,
    maxPopularity,
  };
};

export const getSimilarUsers = async (userId, data = null) => {
  const payload = data || await fetchBehaviorData();
  const sourceBooks = payload.userToBooks.get(String(userId)) || new Set();

  const similar = [];
  for (const [candidateUserId, candidateBooks] of payload.userToBooks.entries()) {
    if (candidateUserId === String(userId)) continue;
    const overlap = jaccardSimilarity(sourceBooks, candidateBooks);
    if (overlap <= 0) continue;
    similar.push({ userId: candidateUserId, score: overlap });
  }

  similar.sort((a, b) => b.score - a.score);
  return similar.slice(0, 50);
};

export const getCollaborativeRecommendations = async (userId, data = null) => {
  const payload = data || await fetchBehaviorData();
  const sourceBooks = payload.userToBooks.get(String(userId)) || new Set();
  const similarUsers = await getSimilarUsers(userId, payload);

  const byBook = new Map();
  for (const similarUser of similarUsers) {
    const candidateBooks = payload.userToBooks.get(similarUser.userId) || new Set();
    for (const bookId of candidateBooks) {
      if (sourceBooks.has(bookId)) continue;
      byBook.set(bookId, (byBook.get(bookId) || 0) + similarUser.score);
    }
  }

  return {
    sourceBooks,
    similarUsers,
    recommendations: Array.from(byBook.entries())
      .map(([bookId, score]) => ({ bookId, collaborativeScore: score }))
      .sort((a, b) => b.collaborativeScore - a.collaborativeScore),
  };
};

const getUserSeedEmbedding = (userBooks, booksById, preferredGenres = []) => {
  const aggregate = new Map();

  for (const bookId of userBooks) {
    const embedding = booksById.get(bookId)?.embedding;
    if (!embedding) continue;
    for (const [token, value] of embedding.entries()) {
      aggregate.set(token, (aggregate.get(token) || 0) + value);
    }
  }

  for (const token of preferredGenres.flatMap(tokenize)) {
    aggregate.set(token, (aggregate.get(token) || 0) + 2);
  }

  return aggregate;
};

export const getSemanticRecommendations = async (userId, data = null) => {
  const payload = data || await fetchBehaviorData();
  const sourceBooks = payload.userToBooks.get(String(userId)) || new Set();
  const user = payload.users.find((candidate) => String(candidate._id) === String(userId));
  const preferredGenres = Array.isArray(user?.preferredGenres) ? user.preferredGenres : [];

  const userSeed = getUserSeedEmbedding(sourceBooks, payload.booksById, preferredGenres);

  const semantic = [];
  for (const [bookId, book] of payload.booksById.entries()) {
    if (sourceBooks.has(bookId)) continue;
    semantic.push({
      bookId,
      semanticSimilarity: cosineSimilarity(userSeed, book.embedding),
    });
  }

  semantic.sort((a, b) => b.semanticSimilarity - a.semanticSimilarity);
  return {
    sourceBooks,
    recommendations: semantic,
  };
};

const inferReason = ({ collaborativeScore, semanticSimilarity, sourceBookTitle }) => {
  if (collaborativeScore >= 0.2 && sourceBookTitle) {
    return `Loved by readers who also read ${sourceBookTitle}`;
  }
  if (collaborativeScore >= 0.12) {
    return 'Trending among similar readers';
  }
  if (semanticSimilarity >= 0.15) {
    return 'Based on your interest in classics';
  }
  return 'Popular among readers with similar taste';
};

export const mergeAndRankRecommendations = async (userId) => {
  const cacheKey = String(userId);
  const cached = recommendationCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const payload = await fetchBehaviorData();
  const userBooks = payload.userToBooks.get(cacheKey) || new Set();

  const collaborative = await getCollaborativeRecommendations(cacheKey, payload);
  const semantic = await getSemanticRecommendations(cacheKey, payload);

  const useCollaborative = userBooks.size >= MIN_CF_BOOKS && collaborative.recommendations.length > 0;

  const collaborativeByBook = new Map(collaborative.recommendations.map((item) => [item.bookId, item.collaborativeScore]));
  const semanticByBook = new Map(semantic.recommendations.map((item) => [item.bookId, item.semanticSimilarity]));

  const candidateIds = new Set([
    ...Array.from(collaborativeByBook.keys()).slice(0, 80),
    ...Array.from(semanticByBook.keys()).slice(0, 80),
  ]);

  if (!candidateIds.size) {
    recommendationCache.set(cacheKey, {
      value: { recommendations: [] },
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return { recommendations: [] };
  }

  const sourceBookTitle = (() => {
    const firstBookId = Array.from(userBooks)[0];
    return payload.booksById.get(firstBookId)?.title || '';
  })();

  const ranked = Array.from(candidateIds)
    .map((bookId) => {
      const collaborativeScore = useCollaborative ? (collaborativeByBook.get(bookId) || 0) : 0;
      const semanticSimilarity = semanticByBook.get(bookId) || 0;
      const metrics = payload.bookMetrics.get(bookId) || { popularity: 0, latestActivityAt: 0 };
      const popularityBoost = normalizePopularity(metrics.popularity, payload.maxPopularity);
      const recencyBoost = normalizeRecency(metrics.latestActivityAt, payload.newestSeenAt);
      const finalScore = (0.6 * collaborativeScore) + (0.4 * semanticSimilarity) + recencyBoost + popularityBoost;

      return {
        bookId,
        collaborativeScore,
        semanticSimilarity,
        recencyBoost,
        popularityBoost,
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, MAX_RECOMMENDATIONS)
    .map((item) => {
      const book = payload.booksById.get(item.bookId);
      if (!book) return null;
      return {
        bookId: String(book._id),
        title: book.title,
        author: book.author,
        coverImage: `https://www.gutenberg.org/cache/epub/${book.gutenbergId}/pg${book.gutenbergId}.cover.medium.jpg`,
        reason: inferReason({
          collaborativeScore: item.collaborativeScore,
          semanticSimilarity: item.semanticSimilarity,
          sourceBookTitle,
        }),
      };
    })
    .filter(Boolean);

  const value = { recommendations: ranked };
  recommendationCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return value;
};

export const invalidateRecommendationCacheV2 = (userId) => {
  if (userId == null) return;
  recommendationCache.delete(String(userId));
};

export const trackRecommendationClickV2 = ({ userId, bookId }) => {
  if (!userId || !bookId) return;
  const key = `${String(userId)}::${String(bookId)}`;
  ctrStats.set(key, (ctrStats.get(key) || 0) + 1);
};

export const getRecommendationClickCountV2 = ({ userId, bookId }) => {
  if (!userId || !bookId) return 0;
  return ctrStats.get(`${String(userId)}::${String(bookId)}`) || 0;
};

export const __private = {
  fetchBehaviorData,
  recommendationCache,
  ctrStats,
};

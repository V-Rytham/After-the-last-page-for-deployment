import { gutenbergCatalog } from '../seed/gutenbergCatalog.js';
import { Book } from '../models/Book.js';
import { log } from '../utils/logger.js';
import { searchArchiveBooks } from './sourceAdapters/archiveAdapter.js';

const GUTENDEX_HOST = 'https://gutendex.com';
const OPEN_LIBRARY_HOST = 'https://openlibrary.org';
const GOOGLE_BOOKS_HOST = 'https://www.googleapis.com/books/v1/volumes';

const GOOGLE_BOOKS_API_KEY = String(process.env.GOOGLE_BOOKS_API_KEY || '').trim();

const SEARCH_TIMEOUT_MS = 12_000;
const MAX_PER_SOURCE = 18;
const MAX_TOTAL = 45;

const UNKNOWN_GENRES = new Set(['unknown', 'n/a', 'none', 'null', 'undefined', 'misc', 'general']);

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeGenreToken = (value) => normalizeWhitespace(value).toLowerCase();
const normalizeTitleAuthorKey = (title, author) => `${normalizeWhitespace(title).toLowerCase()}::${normalizeWhitespace(author).toLowerCase()}`;

const ensureNonEmptyGenres = (genres) => {
  const list = Array.isArray(genres) ? genres : [];
  const cleaned = Array.from(
    new Set(
      list
        .map(normalizeGenreToken)
        .filter(Boolean)
        .filter((g) => !UNKNOWN_GENRES.has(g)),
    ),
  );
  return cleaned;
};

const buildGutenbergCover = (gutenbergId) => (
  `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`
);

const withTimeout = async (url, init = {}, timeoutMs = SEARCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const normalizeCatalogTagsById = (() => {
  const map = new Map();
  for (const entry of Array.isArray(gutenbergCatalog) ? gutenbergCatalog : []) {
    const gutenbergId = Number(entry?.gutenbergId);
    if (!Number.isFinite(gutenbergId) || gutenbergId <= 0) continue;
    const tags = ensureNonEmptyGenres(entry?.tags || []);
    if (tags.length) map.set(gutenbergId, tags);
  }
  return map;
})();

const runSourceSafely = async (label, action) => {
  try {
    const started = Date.now();
    const results = await action();
    const normalized = Array.isArray(results) ? results : [];
    log(`[SEARCH] ${label} results=${normalized.length} (${Date.now() - started}ms)`);
    return normalized;
  } catch (error) {
    console.warn(`[SEARCH] ${label} failed:`, error?.message || error);
    return [];
  }
};

const searchGutenberg = async (q) => {
  const response = await withTimeout(`${GUTENDEX_HOST}/books/?search=${encodeURIComponent(q)}`);
  if (!response.ok) throw new Error(`Gutendex error ${response.status}`);
  const payload = await safeJson(response);
  const list = Array.isArray(payload?.results) ? payload.results : [];

  const mapped = list.slice(0, MAX_PER_SOURCE).map((entry) => {
    const gutenbergId = Number(entry?.id);
    const title = normalizeWhitespace(entry?.title);
    const author = normalizeWhitespace(entry?.authors?.[0]?.name);
    const subjects = ensureNonEmptyGenres([
      ...(Array.isArray(entry?.subjects) ? entry.subjects : []),
      ...(Array.isArray(entry?.bookshelves) ? entry.bookshelves : []),
      ...(normalizeCatalogTagsById.get(gutenbergId) || []),
    ]);

    if (!title || !author) return null;
    if (!Number.isFinite(gutenbergId) || gutenbergId <= 0) return null;
    if (!subjects.length) return null;

    const coverImage = String(entry?.formats?.['image/jpeg'] || '').trim() || buildGutenbergCover(gutenbergId);

    return {
      title,
      author,
      gutenbergId,
      coverImage,
      genres: subjects,
      source: 'gutenberg',
      sourceId: String(gutenbergId),
    };
  }).filter(Boolean);

  // Ensure DB ids exist for Gutenberg entries so Meet/Threads can navigate safely.
  const enriched = await Promise.allSettled(
    mapped.map(async (book) => {
      try {
        const persisted = await Book.findOneAndUpdate(
          { gutenbergId: book.gutenbergId },
          { $set: { title: book.title, author: book.author, gutenbergId: book.gutenbergId, lastAccessedAt: new Date() } },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        ).select('_id').lean();
        return { ...book, internalBookId: persisted?._id ? String(persisted._id) : null };
      } catch {
        return { ...book, internalBookId: null };
      }
    }),
  );

  return enriched
    .map((entry) => (entry.status === 'fulfilled' ? entry.value : null))
    .filter(Boolean);
};

const searchOpenLibrary = async (q) => {
  const response = await withTimeout(`${OPEN_LIBRARY_HOST}/search.json?q=${encodeURIComponent(q)}&limit=${MAX_PER_SOURCE}`);
  if (!response.ok) throw new Error(`OpenLibrary error ${response.status}`);
  const payload = await safeJson(response);
  const docs = Array.isArray(payload?.docs) ? payload.docs : [];

  const base = docs.slice(0, MAX_PER_SOURCE).map((doc) => {
    const title = normalizeWhitespace(doc?.title);
    const author = normalizeWhitespace(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author_name);
    if (!title || !author) return null;

    const workKey = String(doc?.key || '').trim();
    const workId = workKey.replace(/^\/works\//, '').trim();
    const coverId = doc?.cover_i || null;
    const coverImage = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : '';
    const subjects = ensureNonEmptyGenres(doc?.subject || doc?.subjects || doc?.subject_facet || []);

    return {
      title,
      author,
      gutenbergId: null,
      coverImage: coverImage || 'https://placehold.co/420x630?text=No+Cover',
      genres: subjects,
      source: 'openlibrary',
      sourceId: workId || String(doc?.edition_key?.[0] || doc?.cover_edition_key || '').trim(),
      _olWorkId: workId || null,
    };
  }).filter(Boolean);

  const fetchWorkSubjects = async (workId) => {
    if (!workId) return [];
    const workResponse = await withTimeout(`${OPEN_LIBRARY_HOST}/works/${encodeURIComponent(workId)}.json`, {}, 10_000);
    if (!workResponse.ok) return [];
    const work = await safeJson(workResponse);
    return ensureNonEmptyGenres([
      ...(Array.isArray(work?.subjects) ? work.subjects : []),
      ...(Array.isArray(work?.subject_people) ? work.subject_people : []),
      ...(Array.isArray(work?.subject_places) ? work.subject_places : []),
      ...(Array.isArray(work?.subject_times) ? work.subject_times : []),
    ]);
  };

  // Enrich missing subjects from work metadata so searches don't collapse to "no results".
  const concurrency = 6;
  let cursor = 0;
  const enriched = new Array(base.length);

  const worker = async () => {
    while (cursor < base.length) {
      const index = cursor++;
      const entry = base[index];
      if (!entry) {
        enriched[index] = null;
        continue;
      }

      if (Array.isArray(entry.genres) && entry.genres.length > 0) {
        enriched[index] = entry;
        continue;
      }

      const subjects = await fetchWorkSubjects(entry._olWorkId);
      enriched[index] = {
        ...entry,
        genres: subjects,
      };
    }
  };

  await Promise.all(Array.from({ length: concurrency }).map(worker));

  return enriched
    .map((entry) => {
      if (!entry) return null;
      const genres = ensureNonEmptyGenres(entry.genres);
      if (!genres.length) return null;
      return { ...entry, genres };
    })
    .filter(Boolean)
    .map(({ _olWorkId, ...rest }) => rest);
};

const searchGoogleBooks = async (q) => {
  const params = new URLSearchParams({
    q,
    maxResults: String(MAX_PER_SOURCE),
    printType: 'books',
  });
  if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);

  const response = await withTimeout(`${GOOGLE_BOOKS_HOST}?${params.toString()}`);
  if (!response.ok) throw new Error(`Google Books error ${response.status}`);
  const payload = await safeJson(response);
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return items.slice(0, MAX_PER_SOURCE).map((item) => {
    const volume = item?.volumeInfo || {};
    const title = normalizeWhitespace(volume?.title);
    const author = normalizeWhitespace(Array.isArray(volume?.authors) ? volume.authors[0] : '');
    if (!title || !author) return null;

    const categories = ensureNonEmptyGenres(volume?.categories || []);
    if (!categories.length) return null;

    const imageLinks = volume?.imageLinks || {};
    const coverImage = String(imageLinks.thumbnail || imageLinks.smallThumbnail || '').replace(/^http:\/\//i, 'https://');

    return {
      title,
      author,
      gutenbergId: null,
      coverImage: coverImage || 'https://placehold.co/420x630?text=No+Cover',
      genres: categories,
      source: 'googlebooks',
      sourceId: String(item?.id || '').trim(),
    };
  }).filter(Boolean);
};


const searchArchive = async (q) => {
  const items = await searchArchiveBooks(q, { maxResults: MAX_PER_SOURCE, timeoutMs: 1500 });
  return items.map((entry) => ({
    title: normalizeWhitespace(entry?.title),
    author: normalizeWhitespace(entry?.author || 'Unknown author'),
    gutenbergId: null,
    coverImage: normalizeWhitespace(entry?.cover) || 'https://placehold.co/420x630?text=No+Cover',
    genres: [entry?.isPublicDomain ? 'open access' : 'external'],
    source: 'archive',
    sourceId: String(entry?.id || '').trim(),
    isPublicDomain: Boolean(entry?.isPublicDomain),
    readable: false,
  })).filter((entry) => entry.title && entry.author && entry.sourceId);
};

export const runGlobalSearch = async ({ q }) => {
  const term = normalizeWhitespace(q);
  if (!term) return [];

  const [gutenberg, openlibrary, googlebooks, archive] = await Promise.all([
    runSourceSafely('gutenberg', () => searchGutenberg(term)),
    runSourceSafely('openlibrary', () => searchOpenLibrary(term)),
    runSourceSafely('googlebooks', () => searchGoogleBooks(term)),
    runSourceSafely('archive', () => searchArchive(term)),
  ]);

  const merged = [];
  const seen = new Set();

  for (const entry of [...gutenberg, ...openlibrary, ...googlebooks, ...archive]) {
    const key = normalizeTitleAuthorKey(entry.title, entry.author);
    if (seen.has(key)) continue;
    seen.add(key);

    const genres = ensureNonEmptyGenres(entry.genres);
    if (!genres.length) continue;

    merged.push({
      title: normalizeWhitespace(entry.title),
      author: normalizeWhitespace(entry.author),
      gutenbergId: Number.isFinite(Number(entry.gutenbergId)) ? Number(entry.gutenbergId) : null,
      coverImage: normalizeWhitespace(entry.coverImage) || 'https://placehold.co/420x630?text=No+Cover',
      genres,
      source: entry.source,
      sourceId: String(entry.sourceId || '').trim(),
      internalBookId: entry?.internalBookId ? String(entry.internalBookId) : null,
      isPublicDomain: Boolean(entry?.isPublicDomain),
      readable: Boolean(entry?.readable),
    });

    if (merged.length >= MAX_TOTAL) break;
  }

  return merged.slice(0, MAX_TOTAL);
};

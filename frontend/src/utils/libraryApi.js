import api from './api';

const RECENT_BOOKS_KEY = 'atlpg:recent-gutenberg-books:v2';
const PLACEHOLDER_COVER = 'https://placehold.co/420x630?text=No+Cover';

export const fallbackBooks = [
  { gutenbergId: 1342, title: 'Pride and Prejudice', author: 'Jane Austen' },
  { gutenbergId: 84, title: 'Frankenstein', author: 'Mary Shelley' },
  { gutenbergId: 11, title: 'Alice in Wonderland', author: 'Lewis Carroll' },
];

const toTitleCase = (value) => String(value || '')
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const inferTags = (book) => {
  const fromSubjects = Array.isArray(book?.subjects) ? book.subjects : Array.isArray(book?.tags) ? book.tags : [];
  const normalizedSubjects = fromSubjects
    .map((subject) => toTitleCase(String(subject || '').split('--')[0].trim()))
    .filter(Boolean)
    .slice(0, 3);

  if (normalizedSubjects.length > 0) return normalizedSubjects;

  const title = String(book?.title || '').toLowerCase();
  if (/(drama|tragedy|theatre|theater|hamlet|macbeth)/.test(title)) return ['Drama'];
  if (/(fantasy|wonderland|wizard|dragon|magic)/.test(title)) return ['Fantasy'];
  if (/(classic|prejudice|frankenstein|odyssey|iliad)/.test(title)) return ['Classic Literature'];
  if (/(adventure|voyage|journey|island)/.test(title)) return ['Adventure'];
  return [];
};

export const getGutenbergCoverUrl = (gutenbergId) => {
  const id = Number(gutenbergId);
  if (!Number.isFinite(id) || id <= 0) return PLACEHOLDER_COVER;
  return `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;
};

const normalizeBook = (book) => {
  const id = Number(book?.gutenbergId || book?.id || 0);
  if (!Number.isFinite(id) || id <= 0) return null;

  const title = String(book?.title || 'Untitled').trim() || 'Untitled';
  const author = Array.isArray(book?.authors) && book.authors.length
    ? String(book.authors[0]?.name || 'Unknown author')
    : String(book?.author || 'Unknown author');

  return {
    gutenbergId: id,
    title,
    author,
    tags: inferTags(book),
    coverImage: book?.formats?.['image/jpeg'] || book?.coverImage || getGutenbergCoverUrl(id),
  };
};

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const readRecentBooks = () => {
  const raw = window.localStorage.getItem(RECENT_BOOKS_KEY);
  if (!raw) return [];
  const parsed = safeJsonParse(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((book) => normalizeBook(book)).filter(Boolean);
};

export const addRecentBook = (book) => {
  const normalized = normalizeBook(book);
  if (!normalized) return readRecentBooks();

  const existing = readRecentBooks().filter((entry) => Number(entry.gutenbergId) !== normalized.gutenbergId);
  const next = [normalized, ...existing].slice(0, 24);
  window.localStorage.setItem(RECENT_BOOKS_KEY, JSON.stringify(next));
  return next;
};

const fetchWithRetry = async (fetcher, retries = 1) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetcher();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

export const fetchBookByGutenbergId = async (gutenbergId) => {
  const id = Number(gutenbergId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid Gutenberg ID.');

  const request = async () => {
    try {
      const { data } = await api.get(`/books/gutenberg/${id}`);
      const normalized = normalizeBook(data);
      if (normalized) return normalized;
    } catch {
      // Continue to compatible endpoints
    }

    try {
      const { data } = await api.get(`/books/gutenberg/${id}/preview`);
      const normalized = normalizeBook(data);
      if (normalized) return normalized;
    } catch {
      // Continue to fallback endpoint
    }

    const { data } = await api.get(`/books/gutenberg/${id}/read`, {
      params: { maxChapters: 1, processingBudgetMs: 12000 },
    });
    const normalized = normalizeBook(data);
    if (!normalized) throw new Error('Unable to fetch this Gutenberg book.');
    return normalized;
  };

  return fetchWithRetry(request, 1);
};

export const fetchBooksByIds = async (ids = []) => {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  const settled = await Promise.allSettled(uniqueIds.map((id) => fetchBookByGutenbergId(id)));

  return settled
    .map((entry) => (entry.status === 'fulfilled' ? entry.value : null))
    .filter(Boolean);
};

export const searchBooks = async (query, signal) => {
  const term = String(query || '').trim();
  if (!term) return [];

  try {
    const { data } = await api.get('/books/gutenberg/search', { params: { q: term }, signal });
    const books = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    return books.map((book) => normalizeBook(book)).filter(Boolean).slice(0, 24);
  } catch {
    const response = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(term)}`, { signal });
    if (!response.ok) throw new Error('Search is currently unavailable.');
    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results.map((book) => normalizeBook(book)).filter(Boolean).slice(0, 24);
  }
};

export { normalizeBook, PLACEHOLDER_COVER };

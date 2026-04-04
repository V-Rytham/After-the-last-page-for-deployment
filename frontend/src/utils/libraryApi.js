import api from './api';

const RECENT_BOOKS_KEY = 'atlpg:recent-gutenberg-books:v1';
const POPULAR_GUTENBERG_IDS = [84, 1342, 11, 1661, 98, 2701, 74, 1952];

const normalizeSubjects = (book) => {
  const tags = book?.subjects || book?.tags || [];
  if (!Array.isArray(tags)) return [];
  return tags
    .map((value) => String(value || '').split('--')[0].trim())
    .filter(Boolean)
    .slice(0, 3);
};

const normalizeBook = (book) => {
  const id = Number(book?.gutenbergId || book?.id || 0);
  if (!Number.isFinite(id) || id <= 0) return null;

  const title = String(book?.title || 'Untitled').trim() || 'Untitled';

  let author = 'Unknown author';
  if (Array.isArray(book?.authors) && book.authors.length > 0) {
    author = String(book.authors[0]?.name || 'Unknown author');
  } else if (book?.author) {
    author = String(book.author);
  }

  return {
    gutenbergId: id,
    title,
    author,
    tags: normalizeSubjects(book),
    coverImage: book?.formats?.['image/jpeg'] || book?.coverImage || null,
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
  return Array.isArray(parsed) ? parsed.filter((book) => Number.isFinite(Number(book?.gutenbergId))) : [];
};

export const addRecentBook = (book) => {
  const normalized = normalizeBook(book);
  if (!normalized) return readRecentBooks();

  const existing = readRecentBooks().filter((entry) => Number(entry.gutenbergId) !== normalized.gutenbergId);
  const next = [
    {
      ...normalized,
      openedAt: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, 18);

  window.localStorage.setItem(RECENT_BOOKS_KEY, JSON.stringify(next));
  return next;
};

export const fetchBookByGutenbergId = async (gutenbergId) => {
  const id = Number(gutenbergId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid Gutenberg ID.');
  }

  try {
    const { data } = await api.get(`/books/gutenberg/${id}/preview`);
    return normalizeBook(data) || normalizeBook({ gutenbergId: id, title: data?.title, author: data?.author });
  } catch {
    const { data } = await api.get(`/books/gutenberg/${id}/read`, {
      params: {
        maxChapters: 1,
        processingBudgetMs: 12000,
      },
    });

    const normalized = normalizeBook(data);
    if (!normalized) {
      throw new Error('Unable to fetch this Gutenberg book right now.');
    }

    return normalized;
  }
};

export const searchGutendexBooks = async (query, signal) => {
  const search = String(query || '').trim();
  if (!search) return [];

  const response = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(search)}`, { signal });
  if (!response.ok) {
    throw new Error('Search is currently unavailable.');
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.map((book) => normalizeBook(book)).filter(Boolean).slice(0, 18);
};

export const fetchPopularGutenbergBooks = async () => {
  const settled = await Promise.allSettled(
    POPULAR_GUTENBERG_IDS.map((id) => fetchBookByGutenbergId(id)),
  );

  return settled
    .map((entry) => (entry.status === 'fulfilled' ? entry.value : null))
    .filter(Boolean);
};

export const fetchBooksFromCatalog = async () => {
  const { data } = await api.get('/books');
  const books = Array.isArray(data) ? data : [];
  return books.map((book) => normalizeBook(book)).filter(Boolean);
};

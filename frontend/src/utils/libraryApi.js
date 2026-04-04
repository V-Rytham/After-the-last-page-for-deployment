import api from './api';

const RECENT_BOOKS_KEY = 'atlpg:recent-gutenberg-books:v2';
const PLACEHOLDER_COVER = 'https://placehold.co/420x630?text=No+Cover';

export const fallbackBooks = [
  { gutenbergId: 84, title: 'Frankenstein', author: 'Mary Shelley' },
  { gutenbergId: 1342, title: 'Pride and Prejudice', author: 'Jane Austen' },
  { gutenbergId: 11, title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll' },
  { gutenbergId: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle' },
  { gutenbergId: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens' },
  { gutenbergId: 2701, title: 'Moby Dick', author: 'Herman Melville' },
  { gutenbergId: 74, title: 'The Adventures of Tom Sawyer', author: 'Mark Twain' },
  { gutenbergId: 76, title: 'Adventures of Huckleberry Finn', author: 'Mark Twain' },
  { gutenbergId: 345, title: 'Dracula', author: 'Bram Stoker' },
  { gutenbergId: 1080, title: 'A Modest Proposal', author: 'Jonathan Swift' },
  { gutenbergId: 1952, title: 'The Yellow Wallpaper', author: 'Charlotte Perkins Gilman' },
  { gutenbergId: 1400, title: 'Great Expectations', author: 'Charles Dickens' },
  { gutenbergId: 4300, title: 'Ulysses', author: 'James Joyce' },
  { gutenbergId: 64317, title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
  { gutenbergId: 2554, title: 'Crime and Punishment', author: 'Fyodor Dostoevsky' },
  { gutenbergId: 46, title: 'A Christmas Carol', author: 'Charles Dickens' },
  { gutenbergId: 16328, title: 'Beowulf', author: 'Unknown' },
  { gutenbergId: 5200, title: 'Metamorphosis', author: 'Franz Kafka' },
  { gutenbergId: 27827, title: 'The Kama Sutra of Vatsyayana', author: 'Vatsyayana' },
  { gutenbergId: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde' },
  { gutenbergId: 2591, title: 'Grimms Fairy Tales', author: 'Jacob Grimm and Wilhelm Grimm' },
  { gutenbergId: 25344, title: 'The Scarlet Letter', author: 'Nathaniel Hawthorne' },
  { gutenbergId: 844, title: 'The Importance of Being Earnest', author: 'Oscar Wilde' },
  { gutenbergId: 5827, title: 'The Problems of Philosophy', author: 'Bertrand Russell' },
  { gutenbergId: 215, title: 'The Call of the Wild', author: 'Jack London' },
  { gutenbergId: 1184, title: 'The Count of Monte Cristo', author: 'Alexandre Dumas' },
  { gutenbergId: 16, title: 'Peter Pan', author: 'J. M. Barrie' },
  { gutenbergId: 55, title: 'The Wonderful Wizard of Oz', author: 'L. Frank Baum' },
  { gutenbergId: 1260, title: 'Jane Eyre', author: 'Charlotte Brontë' },
  { gutenbergId: 161, title: 'Sense and Sensibility', author: 'Jane Austen' },
  { gutenbergId: 158, title: 'Emma', author: 'Jane Austen' },
  { gutenbergId: 28054, title: 'The Brothers Karamazov', author: 'Fyodor Dostoevsky' },
  { gutenbergId: 996, title: 'Don Quixote', author: 'Miguel de Cervantes' },
  { gutenbergId: 1497, title: 'The Republic', author: 'Plato' },
  { gutenbergId: 1727, title: 'The Odyssey', author: 'Homer' },
  { gutenbergId: 6130, title: 'The Iliad', author: 'Homer' },
  { gutenbergId: 2542, title: 'A Doll’s House', author: 'Henrik Ibsen' },
  { gutenbergId: 1998, title: 'Thus Spake Zarathustra', author: 'Friedrich Nietzsche' },
  { gutenbergId: 1250, title: 'Anthem', author: 'Ayn Rand' },
  { gutenbergId: 768, title: 'Wuthering Heights', author: 'Emily Brontë' },
  { gutenbergId: 2814, title: 'Dubliners', author: 'James Joyce' },
  { gutenbergId: 36, title: 'The War of the Worlds', author: 'H. G. Wells' },
  { gutenbergId: 35, title: 'The Time Machine', author: 'H. G. Wells' },
  { gutenbergId: 1399, title: 'Anna Karenina', author: 'Leo Tolstoy' },
  { gutenbergId: 829, title: 'Gulliver’s Travels', author: 'Jonathan Swift' },
  { gutenbergId: 514, title: 'Little Women', author: 'Louisa May Alcott' },
  { gutenbergId: 41, title: 'The Legend of Sleepy Hollow', author: 'Washington Irving' },
  { gutenbergId: 6593, title: 'History of Tom Jones, a Foundling', author: 'Henry Fielding' },
  { gutenbergId: 2852, title: 'The Hound of the Baskervilles', author: 'Arthur Conan Doyle' },
  { gutenbergId: 219, title: 'Heart of Darkness', author: 'Joseph Conrad' },
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

export const fetchLibraryBooks = async ({ search = '', category = 'all', sort = 'popular', page = 1, perPage = 24, signal } = {}) => {
  const params = {
    page,
    perPage,
    sort,
  };

  if (String(search || '').trim()) params.search = String(search).trim();
  if (category && category !== 'all') params.category = category;

  const { data } = await api.get('/books', { params, signal });

  const list = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.books)
        ? data.books
        : Array.isArray(data)
          ? data
          : [];

  const normalized = list
    .map((entry) => normalizeBook({
      id: entry?.id,
      gutenbergId: entry?.gutenbergId ?? entry?.id,
      title: entry?.title,
      author: entry?.author,
      tags: Array.isArray(entry?.tags) ? entry.tags : [],
      coverImage: entry?.cover_url ?? entry?.coverImage,
    }))
    .filter(Boolean)
    .map((entry) => ({
      ...entry,
      id: entry.gutenbergId,
      category: category === 'all' ? (entry.category || '') : category,
    }));

  const total = Number(data?.total ?? data?.count ?? normalized.length);
  return {
    books: normalized,
    total: Number.isFinite(total) ? total : normalized.length,
  };
};

import api from './api';

const RECENT_BOOKS_KEY = 'atlpg:recent-gutenberg-books:v2';
const PLACEHOLDER_COVER = 'https://placehold.co/420x630?text=No+Cover';
export const GENRE_OPTIONS = [
  'Classic',
  'Mystery',
  'Science Fiction',
  'Fantasy',
  'Philosophy',
  'Romance',
  'Adventure',
  'Historical Fiction',
  'Horror',
  'Poetry',
  'Drama',
  'Satire',
];

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
  const explicitSource = String(book?.source || '').trim().toLowerCase();
  const source = explicitSource || (Number(book?.gutenbergId || book?.id) > 0 ? 'gutenberg' : 'unknown');
  const sourceId = String(
    book?.sourceId
    || (source === 'gutenberg' ? (book?.gutenbergId || book?.id) : '')
    || book?.id
    || '',
  ).trim();
  if (!sourceId) return null;

  const title = String(book?.title || 'Untitled').trim() || 'Untitled';
  const author = Array.isArray(book?.authors) && book.authors.length
    ? String(book.authors[0]?.name || 'Unknown author')
    : String(book?.author || 'Unknown author');
  const gutenbergId = Number(book?.gutenbergId || (source === 'gutenberg' ? sourceId : 0));
  const normalizedId = String(book?.id || `${source}:${sourceId}`);
  const inferredTags = inferTags(book);
  const rawGenres = [
    ...(Array.isArray(book?.genres) ? book.genres : []),
    ...(Array.isArray(book?.genre) ? book.genre : []),
    ...(typeof book?.genre === 'string' ? [book.genre] : []),
    ...(Array.isArray(book?.tags) ? book.tags : []),
  ];
  const genres = Array.from(
    new Set(
      rawGenres
        .flatMap((value) => String(value || '').split(','))
        .map((value) => toTitleCase(String(value || '').split('--')[0].trim()))
        .filter(Boolean),
    ),
  ).slice(0, 3);
  const normalizedGenres = genres.length > 0 ? genres : inferredTags;

  return {
    id: normalizedId,
    source,
    sourceId,
    gutenbergId: Number.isFinite(gutenbergId) && gutenbergId > 0 ? gutenbergId : null,
    title,
    author,
    tags: inferredTags,
    genres: normalizedGenres,
    coverImage: book?.formats?.['image/jpeg']
      || book?.coverImage
      || (Number.isFinite(gutenbergId) && gutenbergId > 0 ? getGutenbergCoverUrl(gutenbergId) : PLACEHOLDER_COVER),
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

  const existing = readRecentBooks().filter((entry) => String(entry.id) !== String(normalized.id));
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

const searchCache = new Map();
const searchInflight = new Map();
const idLookupCache = new Map();
const idLookupInflight = new Map();
let lastSearchAt = 0;
const SEARCH_THROTTLE_MS = 550;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const readFreshCache = (cache, key) => {
  const existing = cache.get(key);
  if (!existing) return null;
  if (Date.now() > existing.expiresAt) {
    cache.delete(key);
    return null;
  }
  return existing.value;
};

export const fetchBookByGutenbergId = async (gutenbergId) => {
  const id = Number(gutenbergId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid Gutenberg ID.');

  const cached = readFreshCache(idLookupCache, id);
  if (cached) return cached;
  const inflight = idLookupInflight.get(id);
  if (inflight) return inflight;

  const request = fetchWithRetry(async () => {
    const { data } = await api.get(`/books/gutenberg/${id}/preview`);
    const normalized = normalizeBook({ ...data, source: 'gutenberg', sourceId: String(id) });
    if (!normalized) throw new Error('Unable to fetch this Gutenberg book.');
    idLookupCache.set(id, { value: normalized, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
    return normalized;
  }, 0).finally(() => {
    idLookupInflight.delete(id);
  });

  idLookupInflight.set(id, request);
  return request;
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
  const cacheKey = term.toLowerCase();
  const cached = readFreshCache(searchCache, cacheKey);
  if (cached) return cached;
  const inflight = searchInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const waitMs = Math.max(0, SEARCH_THROTTLE_MS - (Date.now() - lastSearchAt));
    if (waitMs > 0) await sleep(waitMs);
    lastSearchAt = Date.now();

    try {
      const { data } = await api.get('/books/search', { params: { q: term }, signal });
      const books = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      const normalized = books.map((book) => normalizeBook(book)).filter(Boolean).slice(0, 24);
      searchCache.set(cacheKey, { value: normalized, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
      return normalized;
    } catch (error) {
      const statusCode = Number(error?.response?.status);
      if (statusCode === 429) throw new Error('Too many search requests. Please wait a moment and try again.');
      if (statusCode >= 500) throw new Error('Search is temporarily unavailable. Please try again.');
      throw error;
    }
  })().finally(() => {
    searchInflight.delete(cacheKey);
  });

  searchInflight.set(cacheKey, request);
  return request;
};

export { normalizeBook, PLACEHOLDER_COVER };

const inferCategory = (book) => {
  const title = String(book?.title || '').toLowerCase();
  const tags = (Array.isArray(book?.tags) ? book.tags : []).map((tag) => String(tag).toLowerCase());
  const haystack = `${title} ${tags.join(' ')}`;

  if (/(mystery|detective|sherlock|crime)/.test(haystack)) return 'mystery';
  if (/(philosophy|ethic|metaphysics|republic|zarathustra)/.test(haystack)) return 'philosophy';
  if (/(memoir|history|essay|treatise|biography|nonfiction|non-fiction)/.test(haystack)) return 'non-fiction';
  if (/(classic|prejudice|frankenstein|odyssey|iliad|dickens|austen)/.test(haystack)) return 'classic';
  return 'fiction';
};

const sortBooks = (books, sort) => {
  const list = [...books];
  switch (sort) {
    case 'title-asc':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case 'title-desc':
      return list.sort((a, b) => b.title.localeCompare(a.title));
    case 'author-asc':
      return list.sort((a, b) => a.author.localeCompare(b.author));
    case 'author-desc':
      return list.sort((a, b) => b.author.localeCompare(a.author));
    case 'newest':
      return list.sort((a, b) => (Number(b.gutenbergId) || 0) - (Number(a.gutenbergId) || 0));
    case 'popular':
    default:
      return list.sort((a, b) => {
        const aRecent = Number(readRecentBooks().some((entry) => Number(entry?.gutenbergId) === Number(a.gutenbergId)));
        const bRecent = Number(readRecentBooks().some((entry) => Number(entry?.gutenbergId) === Number(b.gutenbergId)));
        if (aRecent !== bRecent) return bRecent - aRecent;
        return a.title.localeCompare(b.title);
      });
  }
};

export const fetchLibraryBooks = async ({ search = '', category = 'all', sort = 'popular', page = 1, perPage = 24, signal } = {}) => {
  const normalizedSearch = String(search || '').trim().toLowerCase();

  let normalized = [];
  if (normalizedSearch) {
    if (/^\d+$/.test(normalizedSearch)) {
      try {
        normalized = [await fetchBookByGutenbergId(normalizedSearch)];
      } catch (error) {
        const statusCode = Number(error?.response?.status);
        if (statusCode === 404) {
          normalized = [];
        } else if (statusCode === 400) {
          throw new Error('Please enter a valid Gutenberg ID.');
        } else if (statusCode === 429) {
          throw new Error('Too many search requests. Please wait a moment and try again.');
        } else {
          throw new Error('Gutenberg is currently unavailable. Please try again shortly.');
        }
      }
    } else {
      normalized = await searchBooks(normalizedSearch, signal);
    }
  } else {
    try {
      const { data } = await api.get('/books/library', { signal });
      const list = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.books)
            ? data.books
            : Array.isArray(data)
              ? data
              : [];

      normalized = list
        .map((entry) => normalizeBook({
          id: entry?.id,
          source: entry?.source,
          sourceId: entry?.sourceId,
          gutenbergId: entry?.gutenbergId ?? entry?.id ?? entry?.sourceId,
          title: entry?.title,
          author: entry?.author,
          tags: Array.isArray(entry?.tags) ? entry.tags : [],
          genres: Array.isArray(entry?.genres) ? entry.genres : [],
          coverImage: entry?.cover_url ?? entry?.coverImage,
        }))
        .filter(Boolean);
    } catch {
      normalized = [];
    }

    if (normalized.length === 0) {
      normalized = fallbackBooks
        .map((entry) => normalizeBook(entry))
        .filter(Boolean);
    }
  }

  const deduped = Array.from(
    new Map(normalized.map((book) => [String(book.id), { ...book, category: inferCategory(book) }])).values(),
  );

  const filtered = category === 'all'
    ? deduped
    : deduped.filter((book) => book.category === category);

  const sorted = sortBooks(filtered, sort);
  const safePage = Math.max(1, Number(page) || 1);
  const safePerPage = Math.max(1, Number(perPage) || 24);
  const start = (safePage - 1) * safePerPage;
  const paged = sorted.slice(start, start + safePerPage);

  return {
    books: paged.map((entry) => ({ ...entry })),
    total: sorted.length,
  };
};

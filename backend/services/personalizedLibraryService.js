import { top50Books } from '../seed/top50Books.js';

const GROQ_API_URL = String(process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions');
const GROQ_MODEL = String(process.env.GROQ_MODEL || 'llama-3.1-8b-instant');
const REQUEST_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 10_000);
const MAX_BOOKS = 50;

const normalizeGenre = (value) => String(value || '').trim().toLowerCase();

const toTitleCase = (value) => String(value || '')
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const normalizeGenres = (genres = []) => Array.from(
  new Set(
    (Array.isArray(genres) ? genres : [])
      .map((genre) => normalizeGenre(genre))
      .filter(Boolean),
  ),
).slice(0, 8);

const toBookShape = (book) => ({
  title: String(book?.title || '').trim(),
  author: String(book?.author || '').trim(),
  gutenbergId: Number.isFinite(Number(book?.gutenbergId)) ? Number(book.gutenbergId) : null,
  source: 'gutenberg',
  sourceId: String(Number(book?.gutenbergId) || ''),
  genres: Array.isArray(book?.genres) ? book.genres.slice(0, 3) : [],
});

const buildPrompt = (genres) => `
You are a recommendation engine for a classic/public-domain library.
Return strictly valid JSON as an object:
{
  "books": [
    { "title": "string", "author": "string", "gutenbergId": number | null, "genres": ["string"] }
  ]
}

Hard requirements:
- Return exactly 50 books.
- Match the user's preferred genres: ${genres.join(', ')}.
- Prefer high-quality timeless literature.
- No duplicate title+author pairs.
- No commentary, no markdown, no extra keys.
`;

const callGroq = async (genres) => {
  const apiKey = String(process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('Missing GROQ_API_KEY.');
    error.code = 'MISSING_GROQ_KEY';
    throw error;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You generate deterministic structured recommendations.' },
          { role: 'user', content: buildPrompt(genres) },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      const error = new Error(`Groq API error (${response.status}): ${message}`);
      error.code = 'GROQ_HTTP_ERROR';
      throw error;
    }

    const data = await response.json();
    return String(data?.choices?.[0]?.message?.content || '');
  } finally {
    clearTimeout(timeoutId);
  }
};

const parseBooksFromContent = (rawContent) => {
  try {
    const parsed = JSON.parse(rawContent);
    const books = Array.isArray(parsed?.books) ? parsed.books : [];
    return books;
  } catch {
    return [];
  }
};

const sanitizeRecommendations = (books = [], genres = []) => {
  const seen = new Set();
  const normalizedBooks = [];

  for (const book of books) {
    const title = String(book?.title || '').trim();
    const author = String(book?.author || '').trim();
    if (!title || !author) continue;

    const key = `${title.toLowerCase()}::${author.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalizedBooks.push(toBookShape({
      ...book,
      title,
      author,
      genres: Array.isArray(book?.genres) && book.genres.length > 0
        ? book.genres
        : genres.map((genre) => toTitleCase(genre)),
    }));

    if (normalizedBooks.length >= MAX_BOOKS) break;
  }

  if (normalizedBooks.length < MAX_BOOKS) {
    for (const fallback of top50Books) {
      const key = `${fallback.title.toLowerCase()}::${fallback.author.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalizedBooks.push(toBookShape({
        ...fallback,
        genres: genres.map((genre) => toTitleCase(genre)),
      }));
      if (normalizedBooks.length >= MAX_BOOKS) break;
    }
  }

  return normalizedBooks.slice(0, MAX_BOOKS);
};

export const getDefaultTopBooks = () => top50Books.map((book) => toBookShape(book)).slice(0, MAX_BOOKS);

export const buildPersonalizedRecommendations = async (genres = []) => {
  const normalizedGenres = normalizeGenres(genres);
  if (normalizedGenres.length === 0) {
    return { books: getDefaultTopBooks(), personalized: false };
  }

  try {
    const content = await callGroq(normalizedGenres);
    const parsedBooks = parseBooksFromContent(content);
    const sanitized = sanitizeRecommendations(parsedBooks, normalizedGenres);

    if (sanitized.length === 0) {
      return { books: getDefaultTopBooks(), personalized: false };
    }

    return { books: sanitized, personalized: true };
  } catch (error) {
    console.error('[PERSONALIZATION] Recommendation generation failed:', error?.message || error);
    return { books: getDefaultTopBooks(), personalized: false };
  }
};

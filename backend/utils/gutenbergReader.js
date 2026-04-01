const GUTENBERG_HOST = 'https://www.gutenberg.org';
const GUTENDEX_HOST = 'https://gutendex.com';

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TEXT_BYTES = 3_000_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ITEMS = 5;

const readCache = new Map(); // gutenbergId -> { payload, expiresAt, touchedAt }

const cacheGet = (gutenbergId) => {
  const key = String(gutenbergId);
  const entry = readCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    readCache.delete(key);
    return null;
  }
  entry.touchedAt = Date.now();
  return entry.payload;
};

const cacheSet = (gutenbergId, payload) => {
  const key = String(gutenbergId);
  readCache.set(key, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
    touchedAt: Date.now(),
  });

  if (readCache.size <= CACHE_MAX_ITEMS) return;
  const oldest = [...readCache.entries()].sort((a, b) => Number(a[1].touchedAt || 0) - Number(b[1].touchedAt || 0))[0];
  if (oldest) {
    readCache.delete(oldest[0]);
  }
};

export const parseStrictGutenbergId = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const fetchWithTimeout = async (url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Request timed out.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchGutenbergMetadata = async (gutenbergId, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const response = await fetchWithTimeout(`${GUTENDEX_HOST}/books/${encodeURIComponent(String(gutenbergId))}`, { timeoutMs });
  if (!response.ok) {
    const error = new Error(`Unable to fetch metadata for Gutenberg #${gutenbergId}.`);
    error.statusCode = response.status === 404 ? 404 : 502;
    throw error;
  }

  const payload = await response.json();
  const title = String(payload?.title || `Project Gutenberg #${gutenbergId}`).trim();
  const author = String(payload?.authors?.[0]?.name || 'Unknown').trim() || 'Unknown';
  return { title, author, gutenbergId };
};

export const fetchGutenbergText = async (gutenbergId, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_TEXT_BYTES } = {}) => {
  const response = await fetchWithTimeout(
    `${GUTENBERG_HOST}/ebooks/${encodeURIComponent(String(gutenbergId))}.txt.utf-8`,
    { timeoutMs },
  );

  if (!response.ok) {
    const error = new Error(`Unable to fetch Gutenberg text for #${gutenbergId}.`);
    error.statusCode = response.status === 404 ? 404 : 502;
    throw error;
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    const error = new Error('Book text is too large to process safely.');
    error.statusCode = 413;
    throw error;
  }

  if (!response.body) {
    const fallback = await response.text();
    if (Buffer.byteLength(fallback, 'utf8') > maxBytes) {
      const error = new Error('Book text is too large to process safely.');
      error.statusCode = 413;
      throw error;
    }
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      const error = new Error('Book text is too large to process safely.');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join('');
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const toParagraphHtml = (paragraphs) => paragraphs
  .filter(Boolean)
  .map((block) => `<p>${escapeHtml(block)}</p>`)
  .join('\n');

export const convertRawTextToChapters = (rawText) => {
  const lines = String(rawText || '').replaceAll('\r\n', '\n').split('\n');
  const chapterHeadingRegex = /^chapter\s+(\d+|[ivxlcdm]+)\b(?:[\s.:-–—]+(.*))?$/i;

  const chapters = [];
  let inBody = false;
  let currentTitle = null;
  let paragraphBuffer = [];
  let chapterParagraphs = [];

  const flushParagraph = () => {
    const paragraph = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim();
    paragraphBuffer = [];
    if (paragraph) {
      chapterParagraphs.push(paragraph);
    }
  };

  const flushChapter = () => {
    flushParagraph();
    if (!currentTitle) {
      chapterParagraphs = [];
      return;
    }

    const html = toParagraphHtml(chapterParagraphs);
    if (html) {
      chapters.push({
        index: chapters.length + 1,
        title: currentTitle,
        html,
      });
    }

    currentTitle = null;
    chapterParagraphs = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!inBody) {
      if (/^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.test(line)) {
        inBody = true;
      }
      continue;
    }

    if (/^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.test(line)) {
      break;
    }

    const headingMatch = line.match(chapterHeadingRegex);
    if (headingMatch) {
      flushChapter();
      const n = String(headingMatch[1] || chapters.length + 1);
      const suffix = String(headingMatch[2] || '').trim();
      currentTitle = suffix ? `Chapter ${n}: ${suffix}` : `Chapter ${n}`;
      continue;
    }

    if (!currentTitle) {
      continue;
    }

    if (!line) {
      flushParagraph();
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushChapter();

  if (!chapters.length) {
    const paragraphs = [];
    let temp = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        const paragraph = temp.join(' ').replace(/\s+/g, ' ').trim();
        temp = [];
        if (paragraph) paragraphs.push(paragraph);
      } else {
        temp.push(line);
      }
    }

    const trailing = temp.join(' ').replace(/\s+/g, ' ').trim();
    if (trailing) paragraphs.push(trailing);

    const html = toParagraphHtml(paragraphs);
    if (html) {
      return [{ index: 1, title: 'Chapter 1', html }];
    }
  }

  return chapters;
};

export const readGutenbergBookStateless = async (gutenbergId, options = {}) => {
  const cached = cacheGet(gutenbergId);
  if (cached) {
    return cached;
  }

  const metadata = await fetchGutenbergMetadata(gutenbergId, options);
  const rawText = await fetchGutenbergText(gutenbergId, options);
  const chapters = convertRawTextToChapters(rawText);
  const payload = { ...metadata, chapters };

  cacheSet(gutenbergId, payload);
  return payload;
};

export const GUTENBERG_READER_CONFIG = Object.freeze({
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxTextBytes: MAX_TEXT_BYTES,
  cacheTtlMs: CACHE_TTL_MS,
  cacheMaxItems: CACHE_MAX_ITEMS,
});

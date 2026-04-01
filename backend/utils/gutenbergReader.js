const GUTENBERG_HOST = 'https://www.gutenberg.org';
const GUTENDEX_HOST = 'https://gutendex.com';

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_TEXT_BYTES = 3_000_000;

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

  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    const error = new Error('Book text is too large to process safely.');
    error.statusCode = 413;
    throw error;
  }

  return text;
};

export const stripGutenbergBoilerplate = (rawText) => {
  const lines = String(rawText || '').replaceAll('\r\n', '\n').split('\n');
  const startIndex = lines.findIndex((line) => /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.test(line.trim()));
  const endIndex = lines.findIndex((line) => /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.test(line.trim()));
  const start = startIndex >= 0 ? startIndex + 1 : 0;
  const end = endIndex > start ? endIndex : lines.length;
  return lines.slice(start, end).join('\n').trim();
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const toHtmlParagraphs = (text) => String(text || '')
  .split(/\n{2,}/)
  .map((block) => block.replace(/\n+/g, ' ').trim())
  .filter(Boolean)
  .map((block) => `<p>${escapeHtml(block)}</p>`)
  .join('\n');

export const convertTextToChapters = (cleanText) => {
  const lines = String(cleanText || '').split('\n');
  const headingRegex = /^chapter\s+(\d+|[ivxlcdm]+)\b(?:[\s.:\-–—]+(.*))?$/i;

  const chapters = [];
  let currentTitle = null;
  let buffer = [];

  const flush = () => {
    if (!currentTitle) {
      buffer = [];
      return;
    }

    const text = buffer.join('\n').trim();
    buffer = [];
    if (!text) {
      currentTitle = null;
      return;
    }

    chapters.push({
      index: chapters.length + 1,
      title: currentTitle,
      html: toHtmlParagraphs(text),
    });
    currentTitle = null;
  };

  for (const line of lines) {
    const match = line.trim().match(headingRegex);
    if (match) {
      flush();
      const n = String(match[1] || chapters.length + 1);
      const suffix = String(match[2] || '').trim();
      currentTitle = suffix ? `Chapter ${n}: ${suffix}` : `Chapter ${n}`;
      continue;
    }

    if (currentTitle) {
      buffer.push(line);
    }
  }

  flush();

  if (!chapters.length) {
    const fallbackHtml = toHtmlParagraphs(cleanText);
    if (!fallbackHtml) return [];
    return [{ index: 1, title: 'Chapter 1', html: fallbackHtml }];
  }

  return chapters.filter((chapter) => chapter.html);
};

export const readGutenbergBookStateless = async (gutenbergId, options = {}) => {
  const metadata = await fetchGutenbergMetadata(gutenbergId, options);
  const rawText = await fetchGutenbergText(gutenbergId, options);
  const cleanText = stripGutenbergBoilerplate(rawText);
  const chapters = convertTextToChapters(cleanText);
  return { ...metadata, chapters };
};

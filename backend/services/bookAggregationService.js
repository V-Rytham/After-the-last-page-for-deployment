const GUTENDEX_HOST = 'https://gutendex.com';
const OPEN_LIBRARY_HOST = 'https://openlibrary.org';
const INTERNET_ARCHIVE_HOST = 'https://archive.org';

const SOURCE_GUTENBERG = 'gutenberg';
const SOURCE_OPEN_LIBRARY = 'openlibrary';
const SOURCE_INTERNET_ARCHIVE = 'internetarchive';

const SEARCH_TIMEOUT_MS = 12000;
const READ_TIMEOUT_MS = 20000;

const withTimeout = async (url, { timeoutMs = SEARCH_TIMEOUT_MS } = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const safeText = async (response) => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

const normalizeAuthor = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed || 'Unknown author';
};

const normalizeTitle = (value, fallback = 'Untitled') => {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
};

const buildCoverFallback = (title) => `https://placehold.co/420x630?text=${encodeURIComponent(String(title || 'No Cover'))}`;

const toUnifiedBook = ({ source, sourceId, title, author, coverImage, extras = {} }) => ({
  id: `${source}:${sourceId}`,
  title: normalizeTitle(title),
  author: normalizeAuthor(author),
  coverImage: coverImage || buildCoverFallback(title),
  source,
  sourceId: String(sourceId),
  ...extras,
});

const toHtmlParagraphs = (text) => String(text || '')
  .split(/\n{2,}/)
  .map((block) => block.replace(/\n+/g, ' ').trim())
  .filter(Boolean)
  .map((block) => `<p>${block
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')}</p>`)
  .join('\n');

const textToSingleChapter = (text, fallbackTitle = 'Preview') => {
  const html = toHtmlParagraphs(text);
  if (!html) return [];
  return [{ index: 1, title: fallbackTitle, html }];
};

const uniqueById = (books = []) => {
  const map = new Map();
  for (const book of books) {
    if (!book?.id) continue;
    if (!map.has(book.id)) map.set(book.id, book);
  }
  return Array.from(map.values());
};

const runSourceSafely = async (label, action) => {
  const started = Date.now();
  try {
    const results = await action();
    const normalized = Array.isArray(results) ? results : [];
    console.info(`[BOOK][SEARCH] Source ${label} responded with ${normalized.length} results in ${Date.now() - started}ms`);
    return normalized;
  } catch (error) {
    console.warn(`[BOOK][SEARCH] Source ${label} failed:`, error?.message || error);
    return [];
  }
};

const searchGutenberg = async (query) => {
  const response = await withTimeout(`${GUTENDEX_HOST}/books/?search=${encodeURIComponent(query)}`, { timeoutMs: SEARCH_TIMEOUT_MS });
  if (!response.ok) throw new Error(`Gutenberg search failed with ${response.status}`);
  const payload = await safeJson(response);
  const list = Array.isArray(payload?.results) ? payload.results : [];
  return list.slice(0, 24).map((entry) => {
    const gutenbergId = Number(entry?.id);
    const title = normalizeTitle(entry?.title, `Project Gutenberg #${gutenbergId || 'Unknown'}`);
    const author = normalizeAuthor(entry?.authors?.[0]?.name);
    return toUnifiedBook({
      source: SOURCE_GUTENBERG,
      sourceId: String(gutenbergId),
      title,
      author,
      coverImage: entry?.formats?.['image/jpeg'] || `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`,
      extras: {
        gutenbergId,
        formats: entry?.formats || undefined,
      },
    });
  });
};

const searchOpenLibrary = async (query) => {
  const response = await withTimeout(`${OPEN_LIBRARY_HOST}/search.json?q=${encodeURIComponent(query)}&has_fulltext=true&limit=24`, { timeoutMs: SEARCH_TIMEOUT_MS });
  if (!response.ok) throw new Error(`OpenLibrary search failed with ${response.status}`);
  const payload = await safeJson(response);
  const list = Array.isArray(payload?.docs) ? payload.docs : [];

  return list.slice(0, 24).map((entry) => {
    const sourceId = String(entry?.key || entry?.cover_edition_key || entry?.edition_key?.[0] || '').trim();
    const cleanSourceId = sourceId.replace(/^\/works\//, '').replace(/^\/books\//, '');
    const author = Array.isArray(entry?.author_name) && entry.author_name.length ? entry.author_name[0] : 'Unknown author';
    const coverId = entry?.cover_i || null;
    const coverImage = coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : (entry?.cover_edition_key ? `https://covers.openlibrary.org/b/olid/${entry.cover_edition_key}-L.jpg` : null);

    return toUnifiedBook({
      source: SOURCE_OPEN_LIBRARY,
      sourceId: cleanSourceId || String(entry?.edition_key?.[0] || entry?.title || 'unknown'),
      title: entry?.title,
      author,
      coverImage,
      extras: {
        openLibraryKey: entry?.key,
        ia: Array.isArray(entry?.ia) ? entry.ia : [],
      },
    });
  });
};

const searchInternetArchive = async (query) => {
  const q = `title:(${query}) AND mediatype:texts`;
  const fields = ['identifier', 'title', 'creator'];
  const url = `${INTERNET_ARCHIVE_HOST}/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=${fields.join('&fl[]=')}&rows=24&page=1&output=json`;

  const response = await withTimeout(url, { timeoutMs: SEARCH_TIMEOUT_MS });
  if (!response.ok) throw new Error(`Internet Archive search failed with ${response.status}`);

  const payload = await safeJson(response);
  const docs = Array.isArray(payload?.response?.docs) ? payload.response.docs : [];

  return docs.slice(0, 24).map((entry) => {
    const identifier = String(entry?.identifier || '').trim();
    const title = normalizeTitle(entry?.title, identifier || 'Internet Archive Title');
    const author = Array.isArray(entry?.creator) ? entry.creator[0] : entry?.creator;

    return toUnifiedBook({
      source: SOURCE_INTERNET_ARCHIVE,
      sourceId: identifier || title,
      title,
      author,
      coverImage: identifier ? `${INTERNET_ARCHIVE_HOST}/services/img/${encodeURIComponent(identifier)}` : null,
    });
  });
};

export const aggregateBookSearch = async (query) => {
  const term = String(query || '').trim();
  if (!term) return [];

  const [gutenberg, openlibrary, internetarchive] = await Promise.all([
    runSourceSafely(SOURCE_GUTENBERG, () => searchGutenberg(term)),
    runSourceSafely(SOURCE_OPEN_LIBRARY, () => searchOpenLibrary(term)),
    runSourceSafely(SOURCE_INTERNET_ARCHIVE, () => searchInternetArchive(term)),
  ]);

  const merged = uniqueById([...gutenberg, ...openlibrary, ...internetarchive]);
  console.info(
    `[BOOK][SEARCH] Aggregated ${merged.length} total results (gutenberg=${gutenberg.length}, openlibrary=${openlibrary.length}, internetarchive=${internetarchive.length})`,
  );
  return merged.slice(0, 48);
};

const readGutenberg = async ({ sourceId, readGutenbergBookStateless, buildReaderOptions }) => {
  const gutenbergId = Number(sourceId);
  const payload = await readGutenbergBookStateless(gutenbergId, buildReaderOptions());
  return {
    source: SOURCE_GUTENBERG,
    sourceId: String(gutenbergId),
    title: payload?.title,
    author: payload?.author,
    chapters: Array.isArray(payload?.chapters) ? payload.chapters : [],
    availability: 'full',
    availabilityNote: 'Full text from Project Gutenberg.',
    meta: payload,
  };
};

const getOpenLibraryEditions = async (workId) => {
  const url = `${OPEN_LIBRARY_HOST}/works/${encodeURIComponent(workId)}/editions.json?limit=15`;
  const response = await withTimeout(url, { timeoutMs: READ_TIMEOUT_MS });
  if (!response.ok) return [];
  const payload = await safeJson(response);
  return Array.isArray(payload?.entries) ? payload.entries : [];
};

const readOpenLibrary = async ({ sourceId }) => {
  const workId = String(sourceId || '').replace(/^OL/, 'OL').replace(/W$/, 'W');
  const workResponse = await withTimeout(`${OPEN_LIBRARY_HOST}/works/${encodeURIComponent(workId)}.json`, { timeoutMs: READ_TIMEOUT_MS });
  if (!workResponse.ok) throw new Error(`OpenLibrary read failed with ${workResponse.status}`);

  const work = await safeJson(workResponse);
  const title = normalizeTitle(work?.title, `OpenLibrary ${workId}`);

  let author = 'Unknown author';
  if (Array.isArray(work?.authors) && work.authors.length > 0) {
    const authorKey = work.authors[0]?.author?.key;
    if (authorKey) {
      const authorResponse = await withTimeout(`${OPEN_LIBRARY_HOST}${authorKey}.json`, { timeoutMs: READ_TIMEOUT_MS });
      if (authorResponse.ok) {
        const authorData = await safeJson(authorResponse);
        author = normalizeAuthor(authorData?.name);
      }
    }
  }

  const editions = await getOpenLibraryEditions(workId);
  const iaIdentifier = editions
    .flatMap((edition) => (Array.isArray(edition?.ia_box_id) ? edition.ia_box_id : []))
    .find(Boolean)
    || editions
      .flatMap((edition) => (Array.isArray(edition?.ocaid) ? edition.ocaid : [edition?.ocaid]))
      .find(Boolean)
    || null;

  const previewLines = [
    `OpenLibrary work: ${title}`,
    iaIdentifier ? `Internet Archive identifier: ${iaIdentifier}` : 'No full-text identifier was detected for this OpenLibrary work.',
    'Use the source link to view lending/preview options where available.',
  ];

  return {
    source: SOURCE_OPEN_LIBRARY,
    sourceId: workId,
    title,
    author,
    chapters: textToSingleChapter(previewLines.join('\n\n'), 'OpenLibrary Preview'),
    sourceUrl: `${OPEN_LIBRARY_HOST}/works/${workId}`,
    availability: 'preview',
    availabilityNote: 'OpenLibrary API does not expose full plaintext for this work in-app. Open source link for borrowing/preview.',
  };
};

const readInternetArchive = async ({ sourceId }) => {
  const identifier = String(sourceId || '').trim();
  if (!identifier) throw new Error('Internet Archive identifier is required.');

  const metadataResponse = await withTimeout(`${INTERNET_ARCHIVE_HOST}/metadata/${encodeURIComponent(identifier)}`, { timeoutMs: READ_TIMEOUT_MS });
  if (!metadataResponse.ok) throw new Error(`Internet Archive metadata failed with ${metadataResponse.status}`);
  const metadata = await safeJson(metadataResponse);

  const title = normalizeTitle(metadata?.metadata?.title, identifier);
  const author = normalizeAuthor(metadata?.metadata?.creator);
  const files = Array.isArray(metadata?.files) ? metadata.files : [];
  const txtFile = files.find((file) => /\.txt$/i.test(String(file?.name || '')));

  let chapters = [];
  if (txtFile?.name) {
    const textResponse = await withTimeout(`${INTERNET_ARCHIVE_HOST}/download/${encodeURIComponent(identifier)}/${encodeURIComponent(txtFile.name)}`, { timeoutMs: READ_TIMEOUT_MS });
    if (textResponse.ok) {
      const text = await safeText(textResponse);
      chapters = textToSingleChapter(String(text || '').slice(0, 140000), 'Internet Archive Text Preview');
    }
  }

  if (!chapters.length) {
    chapters = textToSingleChapter(
      `This title does not expose a direct plaintext file via Internet Archive API.\n\nOpen the source URL to read or borrow if available.`,
      'Internet Archive Preview',
    );
  }

  return {
    source: SOURCE_INTERNET_ARCHIVE,
    sourceId: identifier,
    title,
    author,
    chapters,
    sourceUrl: `${INTERNET_ARCHIVE_HOST}/details/${identifier}`,
    availability: txtFile?.name ? 'full' : 'preview',
    availabilityNote: txtFile?.name
      ? 'Loaded from Internet Archive plaintext file.'
      : 'Only preview metadata is available in-app for this Internet Archive entry.',
  };
};

export const readBookFromSource = async ({ source, sourceId, readGutenbergBookStateless, buildReaderOptions }) => {
  const normalizedSource = String(source || '').trim().toLowerCase();
  if (!normalizedSource) throw new Error('Source is required.');

  if (normalizedSource === SOURCE_GUTENBERG) {
    return readGutenberg({ sourceId, readGutenbergBookStateless, buildReaderOptions });
  }

  if (normalizedSource === SOURCE_OPEN_LIBRARY) {
    return readOpenLibrary({ sourceId });
  }

  if (normalizedSource === SOURCE_INTERNET_ARCHIVE) {
    return readInternetArchive({ sourceId });
  }

  throw new Error(`Unsupported source: ${normalizedSource}`);
};

export const splitCompositeSourceId = (value) => {
  const raw = String(value || '').trim();
  if (!raw.includes(':')) return null;
  const [source, ...rest] = raw.split(':');
  const sourceId = rest.join(':').trim();
  if (!source || !sourceId) return null;
  return { source: source.trim().toLowerCase(), sourceId };
};

export const SOURCE_NAMES = {
  SOURCE_GUTENBERG,
  SOURCE_OPEN_LIBRARY,
  SOURCE_INTERNET_ARCHIVE,
};

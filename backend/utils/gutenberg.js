const GUTENBERG_HOST = 'https://www.gutenberg.org';
const GUTENDEX_HOST = 'https://gutendex.com';

const escapeHtml = (value) => (
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
);

const STRUCTURAL_MARKER_PATTERNS = [
  /^contents$/i,
  /^preface$/i,
  /^introduction$/i,
  /^volume\s+[A-Z]+$/,
  /^volume\s+[ivxlcdm]+$/i,
  /^book\s+one$/i,
  /^book\s+two$/i,
  /^part\s+one$/i,
  /^part\s+two$/i,
];

const CHAPTER_HEADING_RE = /^chapter\s+(\d+|[ivxlcdm]+)\b(?:[\s.:\-–—]+(.*))?$/i;

const CHAPTER_TITLE_TRAILING_STRUCTURE_RE = /\s*[:\-–—]?\s*(?:volume\s+[A-Z]+|volume\s+[ivxlcdm]+|book\s+(?:one|two)|part\s+(?:one|two)|contents|preface|introduction)\s*$/i;

const MIN_CHAPTER_CHARACTERS = 200;
const MIN_CHAPTER_SENTENCES = 3;

export const getGutenbergTextUrl = (gutenbergId) => (
  `${GUTENBERG_HOST}/ebooks/${encodeURIComponent(String(gutenbergId))}.txt.utf-8`
);

export const getGutenbergCoverUrl = (gutenbergId, size = 'medium') => (
  `${GUTENBERG_HOST}/cache/epub/${encodeURIComponent(String(gutenbergId))}/pg${encodeURIComponent(String(gutenbergId))}.cover.${size}.jpg`
);

export const getGutenbergBookPageUrl = (gutenbergId) => (
  `${GUTENBERG_HOST}/ebooks/${encodeURIComponent(String(gutenbergId))}`
);

export const getGutendexBookUrl = (gutenbergId) => (
  `${GUTENDEX_HOST}/books/${encodeURIComponent(String(gutenbergId))}`
);

export const fetchGutendexBook = async (gutenbergId) => {
  const url = getGutendexBookUrl(gutenbergId);
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch Gutendex book (${gutenbergId}): ${response.status}`);
  }

  return await response.json();
};

export const fetchGutenbergText = async (gutenbergId) => {
  const url = getGutenbergTextUrl(gutenbergId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Gutenberg text (${gutenbergId}): ${response.status}`);
  }
  return await response.text();
};

const findMarkerLineIndex = (lines, regex) => lines.findIndex((line) => regex.test(line.trim()));

export const stripGutenbergBoilerplate = (rawText) => {
  const lines = String(rawText || '').replaceAll('\r\n', '\n').split('\n');

  const startLineIndex = findMarkerLineIndex(lines, /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  const endLineIndex = findMarkerLineIndex(lines, /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);

  const start = startLineIndex >= 0 ? startLineIndex + 1 : 0;
  const end = endLineIndex >= 0 && endLineIndex > start ? endLineIndex : lines.length;

  return lines.slice(start, end).join('\n').trim();
};

const isStructuralMarkerLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return STRUCTURAL_MARKER_PATTERNS.some((pattern) => pattern.test(trimmed));
};

const parseChapterHeading = (line) => {
  const trimmed = line.trim();
  const match = trimmed.match(CHAPTER_HEADING_RE);
  if (!match) return null;

  const rawNumber = match[1];
  const chapterTitle = String(match[2] || '')
    .replace(CHAPTER_TITLE_TRAILING_STRUCTURE_RE, '')
    .trim()
    .replace(/[\s.:\-–—]+$/g, '');

  return {
    chapter_number: rawNumber,
    chapter_title: chapterTitle || `Chapter ${rawNumber}`,
  };
};

const toParagraphHtml = (block) => {
  const cleaned = block
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

  if (!cleaned) return '';
  return `<p>${escapeHtml(cleaned)}</p>`;
};

const blocksToHtml = (blocks) => (
  blocks
    .map(toParagraphHtml)
    .filter(Boolean)
    .join('\n')
);

const countWords = (value) => (
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length
);

const countSentences = (value) => (
  String(value || '')
    .split(/[.!?]+(?:\s|$)/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .length
);

const isValidNarrativeChapter = (text) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  return normalized.length > MIN_CHAPTER_CHARACTERS || countSentences(normalized) > MIN_CHAPTER_SENTENCES;
};

const logDetectedChapter = ({ chapter_number, chapter_title, chapter_text }) => {
  const wordCount = countWords(chapter_text);
  console.log(`Detected Chapter: ${chapter_number}`);
  console.log(`Title: ${chapter_title}`);
  console.log(`Length: ${wordCount} words`);
};

const buildChapterRecord = ({ chapter_number, chapter_title, chapter_text }, fallbackIndex) => {
  const blocks = chapter_text
    .split(/\n{2,}/g)
    .map((block) => block.replace(/\n+/g, ' ').trim())
    .filter(Boolean);

  const html = blocksToHtml(blocks);
  const numeric = Number.parseInt(chapter_number, 10);
  const chapterIndex = Number.isFinite(numeric) ? numeric : fallbackIndex;

  return {
    chapter_number,
    chapter_title,
    chapter_text,
    index: chapterIndex,
    title: chapter_title,
    html,
    wordCount: countWords(chapter_text),
  };
};

export const convertTextToChapters = (text, { fallbackTitle = 'Chapter' } = {}) => {
  const lines = String(text || '').replaceAll('\r\n', '\n').split('\n');

  const chapters = [];
  let currentHeading = null;
  let buffer = [];

  const flush = () => {
    if (!currentHeading) {
      buffer = [];
      return;
    }

    const chapterText = buffer.join('\n').trim();
    buffer = [];

    if (!isValidNarrativeChapter(chapterText)) {
      currentHeading = null;
      return;
    }

    const record = buildChapterRecord({ ...currentHeading, chapter_text: chapterText }, chapters.length + 1);
    if (!record.html) {
      currentHeading = null;
      return;
    }

    logDetectedChapter({
      chapter_number: record.chapter_number,
      chapter_title: record.chapter_title,
      chapter_text: record.chapter_text,
    });

    chapters.push(record);
    currentHeading = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (isStructuralMarkerLine(trimmed)) {
      continue;
    }

    const parsedHeading = parseChapterHeading(trimmed);
    if (parsedHeading) {
      flush();
      currentHeading = parsedHeading;
      continue;
    }

    if (!currentHeading) {
      continue;
    }

    buffer.push(rawLine);
  }

  flush();

  if (chapters.length === 0) {
    const fallbackText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!isValidNarrativeChapter(fallbackText)) {
      return [];
    }

    const title = `${fallbackTitle} 1`;
    return [buildChapterRecord({
      chapter_number: '1',
      chapter_title: title,
      chapter_text: String(text || '').trim(),
    }, 1)];
  }

  return chapters;
};

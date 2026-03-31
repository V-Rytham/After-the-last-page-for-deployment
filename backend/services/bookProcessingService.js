import { Book } from '../models/Book.js';
import {
  fetchGutenbergText,
  getGutenbergBookPageUrl,
  stripGutenbergBoilerplate,
} from '../utils/gutenberg.js';

const MIN_PAGE_WORDS = 250;
const MAX_PAGE_WORDS = 500;
const SYNTHETIC_SECTION_WORDS = 4000;

const SECTION_HEADER_RE = /^(?:\s*)(chapter\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)|book\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)|part\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)|act\s+(?:\d+|[ivxlcdm]+)|scene\s+(?:\d+|[ivxlcdm]+))(?:[\s.:\-–—]+(.*))?$/i;

const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

const normalizeWhitespace = (text) => String(text || '')
  .replaceAll('\r\n', '\n')
  .replace(/\t/g, ' ')
  .replace(/\u00a0/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ ]{2,}/g, ' ')
  .trim();

const splitParagraphs = (text) => normalizeWhitespace(text)
  .split(/\n{2,}/)
  .map((p) => p.replace(/\n+/g, ' ').trim())
  .filter(Boolean);

const splitSentences = (paragraph) => {
  const parts = String(paragraph || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (parts || [paragraph]).map((s) => s.trim()).filter(Boolean);
};

export const fetchGutenbergBook = async (gutenbergId) => fetchGutenbergText(gutenbergId);

export const cleanBookText = (rawText) => {
  const stripped = stripGutenbergBoilerplate(rawText);
  return normalizeWhitespace(stripped);
};

const buildSection = (index, title, text) => ({
  chapterNumber: index + 1,
  title: title || `Part ${index + 1}`,
  rawText: String(text || '').trim(),
});

const fallbackSyntheticSections = (cleanText) => {
  const words = cleanText.split(/\s+/).filter(Boolean);
  const sections = [];

  for (let i = 0; i < words.length; i += SYNTHETIC_SECTION_WORDS) {
    const chunk = words.slice(i, i + SYNTHETIC_SECTION_WORDS).join(' ');
    sections.push(buildSection(sections.length, `Part ${sections.length + 1}`, chunk));
  }

  return sections;
};

export const extractChapters = (cleanText) => {
  const lines = String(cleanText || '').split('\n');
  const sections = [];

  let currentTitle = null;
  let currentBuffer = [];

  const flush = () => {
    if (!currentTitle && currentBuffer.length === 0) {
      return;
    }

    const body = currentBuffer.join('\n').trim();
    currentBuffer = [];

    if (!body) {
      return;
    }

    sections.push(buildSection(sections.length, currentTitle, body));
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const marker = line.match(SECTION_HEADER_RE);

    if (marker) {
      flush();
      currentTitle = line;
      continue;
    }

    if (!currentTitle && !line) {
      continue;
    }

    currentBuffer.push(rawLine);
  }

  flush();

  if (!sections.length) {
    return fallbackSyntheticSections(cleanText);
  }

  return sections;
};

export const paginateChapterContent = (chapterText) => {
  const pages = [];
  const paragraphs = splitParagraphs(chapterText);

  let currentPage = [];
  let currentWords = 0;

  const flushPage = () => {
    const content = currentPage.join('\n\n').trim();
    if (!content) return;

    pages.push({
      pageNumber: pages.length + 1,
      content,
      wordCount: countWords(content),
    });

    currentPage = [];
    currentWords = 0;
  };

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph);

    if (paragraphWords > MAX_PAGE_WORDS) {
      const sentences = splitSentences(paragraph);
      for (const sentence of sentences) {
        const sentenceWords = countWords(sentence);
        if (currentWords + sentenceWords > MAX_PAGE_WORDS && currentWords >= MIN_PAGE_WORDS) {
          flushPage();
        }
        currentPage.push(sentence);
        currentWords += sentenceWords;
      }
      continue;
    }

    if (currentWords + paragraphWords > MAX_PAGE_WORDS && currentWords >= MIN_PAGE_WORDS) {
      flushPage();
    }

    currentPage.push(paragraph);
    currentWords += paragraphWords;
  }

  flushPage();

  if (!pages.length) {
    const content = normalizeWhitespace(chapterText);
    if (content) {
      pages.push({ pageNumber: 1, content, wordCount: countWords(content) });
    }
  }

  return pages;
};

const toLegacyChapter = (chapter) => {
  const combined = chapter.pages.map((page) => page.content).join('\n\n');
  const html = chapter.pages.map((page) => `<p>${page.content.replace(/\n\n/g, '</p><p>')}</p>`).join('\n');

  return {
    index: chapter.chapterNumber,
    title: chapter.title,
    html,
    wordCount: countWords(combined),
    chapter_number: String(chapter.chapterNumber),
    chapter_title: chapter.title,
    chapter_text: combined,
    pages: chapter.pages,
  };
};

export const processBook = async (bookId) => {
  const book = await Book.findById(bookId);
  if (!book) {
    const err = new Error('Book not found.');
    err.statusCode = 404;
    throw err;
  }

  if (!book.gutenbergId) {
    const err = new Error('Book does not have a Gutenberg ID.');
    err.statusCode = 400;
    throw err;
  }

  const existing = Array.isArray(book.chapters) ? book.chapters : [];
  if (existing.length > 0) {
    return book;
  }

  book.status = 'processing';
  book.processingStatus = {
    state: 'processing',
    lastProcessedAt: book.processingStatus?.lastProcessedAt,
    errorMessage: null,
  };
  book.ingestionError = null;
  await book.save();

  try {
    const rawText = await fetchGutenbergBook(book.gutenbergId);
    const cleanText = cleanBookText(rawText);
    const chapters = extractChapters(cleanText)
      .map((chapter) => ({
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        pages: paginateChapterContent(chapter.rawText),
      }))
      .filter((chapter) => chapter.pages.length > 0);

    if (!chapters.length) {
      throw new Error('Unable to extract readable sections from this Gutenberg text.');
    }

    book.textContent = cleanText;
    book.chapters = chapters.map(toLegacyChapter);
    book.sourceProvider = book.sourceProvider || 'Project Gutenberg';
    book.sourceUrl = book.sourceUrl || getGutenbergBookPageUrl(book.gutenbergId);
    book.status = 'ready';
    book.processingStatus = {
      state: 'ready',
      lastProcessedAt: new Date(),
      errorMessage: null,
    };
    book.ingestionError = null;

    await book.save();
    return book;
  } catch (error) {
    book.status = 'failed';
    book.ingestionError = String(error?.message || error);
    book.processingStatus = {
      state: 'failed',
      lastProcessedAt: book.processingStatus?.lastProcessedAt,
      errorMessage: book.ingestionError,
    };
    await book.save();
    throw error;
  }
};

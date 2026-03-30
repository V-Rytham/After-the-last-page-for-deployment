import { Book } from '../models/Book.js';
import { convertTextToChapters, fetchGutenbergText, getGutenbergBookPageUrl, getGutenbergCoverUrl, stripGutenbergBoilerplate } from '../utils/gutenberg.js';

const parseGutenbergRouteId = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^g?(\d+)$/);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
};

const fetchBookByRouteId = async (routeId, projection) => {
  const gutenbergId = parseGutenbergRouteId(routeId);
  if (gutenbergId != null) {
    return Book.findOne({ gutenbergId }).select(projection);
  }

  return Book.findById(routeId).select(projection);
};

const createVirtualGutenbergBook = (routeId) => {
  const gutenbergId = parseGutenbergRouteId(routeId);
  if (gutenbergId == null) {
    return null;
  }

  return {
    title: `Project Gutenberg #${gutenbergId}`,
    author: 'Project Gutenberg',
    gutenbergId,
    sourceProvider: 'Project Gutenberg',
    sourceUrl: getGutenbergBookPageUrl(gutenbergId),
    rights: 'Public domain (Project Gutenberg)',
    coverImage: getGutenbergCoverUrl(gutenbergId, 'medium'),
  };
};

export const getBooks = async (req, res) => {
  try {
    const books = await Book.find({}).select('-textContent -chapters');
    res.json(books);
  } catch {
    res.status(500).json({ message: 'Server error fetching books' });
  }
};

export const getBookById = async (req, res) => {
  try {
    const book = await fetchBookByRouteId(req.params.id, '-textContent -chapters');
    if (book) {
      res.json(book);
    } else {
      const virtualBook = createVirtualGutenbergBook(req.params.id);
      if (virtualBook) {
        res.json(virtualBook);
        return;
      }

      res.status(404).json({ message: 'Book not found' });
    }
  } catch {
    const virtualBook = createVirtualGutenbergBook(req.params.id);
    if (virtualBook) {
      res.json(virtualBook);
      return;
    }

    res.status(500).json({ message: 'Server error fetching book' });
  }
};

export const getBookContent = async (req, res) => {
  const routeBookId = req.params.id;
  const gutenbergIdFromRoute = parseGutenbergRouteId(routeBookId);

  const buildRemoteGutenbergResponse = async (gutenbergId) => {
    const rawText = await fetchGutenbergText(gutenbergId);
    const mainText = stripGutenbergBoilerplate(rawText);
    const chapters = convertTextToChapters(mainText, { fallbackTitle: 'Chapter' });

    return {
      chapters,
      sourceProvider: 'Project Gutenberg',
      sourceUrl: getGutenbergBookPageUrl(gutenbergId),
      rights: 'Public domain (Project Gutenberg)',
      gutenbergId,
    };
  };

  try {
    const book = await fetchBookByRouteId(routeBookId, 'chapters sourceProvider sourceUrl rights gutenbergId title author coverImage synopsis');
    if (!book) {
      if (gutenbergIdFromRoute != null) {
        try {
          const remoteBook = await buildRemoteGutenbergResponse(gutenbergIdFromRoute);
          res.json(remoteBook);
          return;
        } catch (error) {
          console.error(`[BOOK] Failed to fetch Gutenberg book for route id ${routeBookId}:`, error?.message || error);
        }
      }

      res.status(404).json({ message: 'Book not found' });
      return;
    }

    const chapters = Array.isArray(book.chapters) ? book.chapters : [];
    const hasChapters = chapters.length > 0;

    const buildLocalFallbackChapters = () => {
      const synopsis = (book.synopsis || 'Content for this book is not available in this environment yet.').toString();
      const safeSynopsis = synopsis.replace(/[<>]/g, ' ');
      const wordCount = safeSynopsis.trim().split(/\s+/).filter(Boolean).length;

      return [{
        index: 1,
        title: book.title || 'Chapter 1',
        html: `<p>${safeSynopsis}</p>`,
        wordCount,
      }];
    };

    if (!hasChapters && book.gutenbergId) {
      try {
        const remoteBook = await buildRemoteGutenbergResponse(book.gutenbergId);

        book.chapters = remoteBook.chapters;
        book.sourceUrl = remoteBook.sourceUrl;
        book.coverImage = book.coverImage || getGutenbergCoverUrl(book.gutenbergId, 'medium');
        book.rights = book.rights || remoteBook.rights;
        book.sourceProvider = book.sourceProvider || remoteBook.sourceProvider;
        await book.save();

        res.json({
          chapters: remoteBook.chapters,
          sourceProvider: book.sourceProvider,
          sourceUrl: book.sourceUrl,
          rights: book.rights,
          gutenbergId: book.gutenbergId,
        });
        return;
      } catch (error) {
        console.error(`[BOOK] Failed to lazily ingest Gutenberg book ${book.title} (${book.gutenbergId}):`, error?.message || error);
        const fallbackChapters = buildLocalFallbackChapters();
        res.json({
          chapters: fallbackChapters,
          sourceProvider: book.sourceProvider || 'Project Gutenberg',
          sourceUrl: book.sourceUrl || getGutenbergBookPageUrl(book.gutenbergId),
          rights: book.rights || 'Public domain (Project Gutenberg)',
          gutenbergId: book.gutenbergId,
        });
        return;
      }
    }

    if (!hasChapters) {
      const fallbackChapters = buildLocalFallbackChapters();
      res.json({
        chapters: fallbackChapters,
        sourceProvider: book.sourceProvider || 'Project Gutenberg',
        sourceUrl: book.sourceUrl || (book.gutenbergId ? getGutenbergBookPageUrl(book.gutenbergId) : undefined),
        rights: book.rights || 'Public domain (Project Gutenberg)',
        gutenbergId: book.gutenbergId,
      });
      return;
    }

    res.json({
      chapters,
      sourceProvider: book.sourceProvider,
      sourceUrl: book.sourceUrl,
      rights: book.rights,
      gutenbergId: book.gutenbergId,
    });
  } catch {
    if (gutenbergIdFromRoute != null) {
      try {
        const remoteBook = await buildRemoteGutenbergResponse(gutenbergIdFromRoute);
        res.json(remoteBook);
        return;
      } catch (error) {
        console.error(`[BOOK] Failed to load Gutenberg fallback for ${routeBookId}:`, error?.message || error);
      }
    }

    res.status(500).json({ message: 'Server error fetching book content' });
  }
};

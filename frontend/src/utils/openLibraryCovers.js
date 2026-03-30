const OPEN_LIBRARY_BASE = 'https://covers.openlibrary.org';

const normalizeIsbn = (value) => {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeIsbn(entry);
      if (normalized) return normalized;
    }
    return null;
  }

  if (typeof value !== 'string') return null;

  const cleaned = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (cleaned.length === 10 || cleaned.length === 13) return cleaned;
  return null;
};

const getBookIsbn = (book) => {
  if (!book) return null;
  return (
    normalizeIsbn(book.isbn) ||
    normalizeIsbn(book.isbn13) ||
    normalizeIsbn(book.isbn10) ||
    normalizeIsbn(book.identifiers?.isbn) ||
    null
  );
};

export const getOpenLibraryCoverCandidates = (book) => {
  const candidates = [];

  if (book?.coverImage) {
    candidates.push(book.coverImage);
  }

  const isbn = getBookIsbn(book);
  if (isbn) {
    candidates.push(`${OPEN_LIBRARY_BASE}/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`);
  }

  if (book?.title) {
    const encodedTitle = encodeURIComponent(book.title.trim());
    candidates.push(`${OPEN_LIBRARY_BASE}/b/title/${encodedTitle}-L.jpg?default=false`);
    candidates.push(`${OPEN_LIBRARY_BASE}/b/title/${encodedTitle}.jpg?default=false`);
  }

  return [...new Set(candidates.filter(Boolean))];
};


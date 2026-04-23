const toList = (value) => (Array.isArray(value) ? value : []);

const normalizeBook = (book) => {
  const source = String(book?.source || '').trim().toLowerCase();
  const sourceBookId = String(book?.sourceId || '').trim();
  if (!source || !sourceBookId) return null;

  const title = String(book?.title || 'Untitled').trim() || 'Untitled';
  const author = String(book?.author || 'Unknown author').trim() || 'Unknown author';
  const cover = String(book?.coverImage || '').trim();

  return {
    id: sourceBookId,
    title,
    author,
    cover,
    source,
    source_book_id: sourceBookId,
  };
};

export default function normalizeSearchResults(results) {
  return toList(results).map(normalizeBook).filter(Boolean);
}

export { normalizeBook, toList };

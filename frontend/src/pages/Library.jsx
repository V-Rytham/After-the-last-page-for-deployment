import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BookCoverArt from '../components/books/BookCoverArt';
import api from '../utils/api';
import './Library.css';

const OPEN_LIBRARY_COVER_BASE = 'https://covers.openlibrary.org/b/id';

const getCoverId = (book) => {
  const candidates = [book?.coverId, book?.cover_id, book?.cover?.id, book?.metadata?.coverId];
  const match = candidates.find((value) => value !== null && value !== undefined && String(value).trim() !== '');
  return match ? String(match).trim() : null;
};

const getTags = (book) => {
  const tags = new Set();
  const normalizedTags = Array.isArray(book?.tags)
    ? book.tags.map((tag) => String(tag).toLowerCase())
    : [];

  const isClassic =
    book?.isClassic === true ||
    book?.classic === true ||
    normalizedTags.includes('classic') ||
    String(book?.era || '').toLowerCase().includes('classic');

  const isGutenberg =
    Boolean(book?.gutenbergId) ||
    normalizedTags.includes('gutenberg') ||
    String(book?.source || '').toLowerCase().includes('gutenberg');

  if (isClassic) tags.add('Classic');
  if (isGutenberg) tags.add('Gutenberg');

  return [...tags];
};

const LibraryPage = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadBooks = async () => {
      try {
        const { data } = await api.get('/books');
        if (!mounted) return;
        setBooks(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('[LIBRARY] Failed to load books:', error);
        if (!mounted) return;
        setBooks([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadBooks();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="library-page">
      <div className="content-container library-shell">
        <div className="library-hero">
          <div className="library-copy">
            <h1 className="library-title">Library</h1>
            <p className="library-subtitle">Your recent Gutenberg reads.</p>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading books…</div>
        ) : books.length === 0 ? (
          <div className="no-results">
            <BookOpen size={32} />
            <p>No books yet. Enter a Gutenberg ID to start reading.</p>
          </div>
        ) : (
          <section className="books-grid" aria-label="Library books">
            {books.map((book) => {
              const coverId = getCoverId(book);
              const artBook = coverId
                ? { ...book, coverImage: `${OPEN_LIBRARY_COVER_BASE}/${encodeURIComponent(coverId)}-L.jpg` }
                : book;
              const tags = getTags(book);

              return (
                <article
                  key={book._id || String(book.gutenbergId)}
                  className="book-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/read/gutenberg/${book.gutenbergId}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/read/gutenberg/${book.gutenbergId}`);
                    }
                  }}
                >
                  <div className="book-cover-wrap">
                    <BookCoverArt
                      book={artBook}
                      alt={`${book.title} cover`}
                      fallbackClassName="book-cover-fallback"
                      showPattern
                    />
                  </div>

                  <div className="book-info">
                    <h2 className="book-title">{book.title}</h2>
                    <p className="book-author">{book.author || 'Unknown author'}</p>
                  </div>

                  {tags.length > 0 && (
                    <div className="book-tags" aria-label="Book metadata">
                      {tags.map((tag) => (
                        <span key={`${book.gutenbergId}-${tag}`} className="book-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn-read"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/read/gutenberg/${book.gutenbergId}`);
                    }}
                  >
                    Read this book
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
};

export default LibraryPage;

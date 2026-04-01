import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BookCard from '../components/books/BookCard';
import api from '../utils/api';
import './Library.css';

const LibraryPage = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [gutenbergId, setGutenbergId] = useState('');
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
        if (mounted) setLoading(false);
      }
    };

    loadBooks();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    const id = String(gutenbergId || '').trim();
    if (!id) return;
    navigate(`/read/gutenberg/${encodeURIComponent(id)}`);
  };

  return (
    <div className="library-page">
      <div className="content-container library-shell">
        <header className="library-header">
          <div>
            <h1 className="library-title">Library</h1>
            <p className="library-subtitle">Browse your books and jump into a Gutenberg read.</p>
          </div>
          <form className="gutenberg-entry" onSubmit={handleSubmit}>
            <label htmlFor="gutenberg-id" className="gutenberg-label">Enter Gutenberg ID</label>
            <input
              id="gutenberg-id"
              className="gutenberg-input"
              value={gutenbergId}
              onChange={(event) => setGutenbergId(event.target.value)}
              placeholder="e.g. 1342"
              inputMode="numeric"
            />
            <button type="submit" className="gutenberg-button">Read Book</button>
          </form>
        </header>

        {loading ? (
          <div className="loading">Loading books…</div>
        ) : books.length === 0 ? (
          <div className="no-results">
            <BookOpen size={28} />
            <p>No books yet. Enter a Gutenberg ID to start reading.</p>
          </div>
        ) : (
          <section className="books-grid" aria-label="Library books">
            {books.map((book) => (
              <BookCard
                key={book._id || String(book.gutenbergId)}
                book={book}
                to={`/read/gutenberg/${book.gutenbergId}`}
                actionLabel="Read"
                actionHref={`/read/gutenberg/${book.gutenbergId}`}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default LibraryPage;

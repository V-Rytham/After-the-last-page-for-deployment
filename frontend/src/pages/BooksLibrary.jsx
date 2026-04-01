import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import api from '../utils/api';
import './BooksLibrary.css';

const BooksLibrary = () => {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadRecent = async () => {
      try {
        const { data } = await api.get('/books');
        if (!mounted) return;
        const recent = Array.isArray(data) ? data.slice(0, 5) : [];
        setBooks(recent);
      } catch (error) {
        console.error('[DESK] Failed to load recent books:', error);
        if (mounted) setBooks([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadRecent();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="library-page animate-fade-in">
      <header className="library-hero">
        <div className="library-controls">
          <p className="library-subtitle">Recent books from your Gutenberg reading activity.</p>
          <Link to="/request-book" className="request-book-cta">
            Request a Gutenberg book to start reading.
          </Link>
        </div>
      </header>

      <section className="library-section">
        {loading ? (
          <div className="loading">Loading recent books…</div>
        ) : books.length === 0 ? (
          <div className="no-results shelf-empty">
            <BookOpen size={32} className="text-muted" />
            <h3 className="font-serif">No books yet.</h3>
            <p>Enter a Gutenberg ID and start reading to build your library.</p>
          </div>
        ) : (
          <div className="books-grid">
            {books.map((book) => (
              <Link key={book._id || String(book.gutenbergId)} to={`/read/gutenberg/${book.gutenbergId}`} className="book-card">
                <div className="book-info">
                  <h3 className="book-title">{book.title}</h3>
                  <p className="book-author">{book.author}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default BooksLibrary;

import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import './Library.css';

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
            {books.map((book) => (
              <button
                key={book._id || String(book.gutenbergId)}
                type="button"
                className="book-card"
                onClick={() => navigate(`/read/gutenberg/${book.gutenbergId}`)}
              >
                <div className="book-info">
                  <h2 className="book-title">{book.title}</h2>
                  <p className="book-author">{book.author}</p>
                </div>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default LibraryPage;

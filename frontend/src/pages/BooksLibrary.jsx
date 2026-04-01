import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import BookCard from '../components/books/BookCard';
import api from '../utils/api';
import './BooksLibrary.css';

const getRecommendationsFromResponse = (payload) => {
  const recommendations = payload?.recommendations;
  if (!recommendations) return [];

  if (Array.isArray(recommendations)) return recommendations;

  if (typeof recommendations === 'object') {
    return Object.values(recommendations)
      .flatMap((shelf) => (Array.isArray(shelf) ? shelf : []));
  }

  return [];
};

const BooksLibrary = () => {
  const [books, setBooks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadDesk = async () => {
      try {
        const { data } = await api.get('/books');
        if (!mounted) return;
        const allBooks = Array.isArray(data) ? data : [];
        setBooks(allBooks);

        const readBookIds = allBooks.map((book) => book?._id).filter(Boolean);
        const { data: recData } = await api.post('/recommender', {
          readBookIds,
          currentBookId: readBookIds[0] || undefined,
          limitPerShelf: 6,
        });

        if (!mounted) return;
        const deduped = [];
        const seen = new Set(readBookIds);
        getRecommendationsFromResponse(recData).forEach((book) => {
          const key = String(book?._id || book?.gutenbergId || `${book?.title}-${book?.author}`);
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(book);
          }
        });
        setRecommendations(deduped.slice(0, 8));
      } catch (error) {
        console.error('[DESK] Failed to load desk data:', error);
        if (mounted) {
          setBooks([]);
          setRecommendations([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDesk();

    return () => {
      mounted = false;
    };
  }, []);

  const continueBook = useMemo(() => books[0] || null, [books]);
  const shelfBooks = useMemo(() => books.slice(0, 12), [books]);

  return (
    <div className="desk-page">
      <div className="content-container desk-shell">
        <header className="desk-header">
          <h1>Your Desk</h1>
          <p>Your active reading space, shelf, and recommendations.</p>
        </header>

        <section className="desk-section" aria-label="Continue reading">
          <div className="section-heading">
            <h2>Continue Reading</h2>
          </div>
          {loading ? (
            <div className="loading">Loading your desk…</div>
          ) : continueBook ? (
            <article className="continue-card">
              <div className="continue-cover">
                <BookCard book={continueBook} to={`/read/gutenberg/${continueBook.gutenbergId}`} compact />
              </div>
              <div className="continue-copy">
                <h3>{continueBook.title}</h3>
                <p>{continueBook.author || 'Unknown author'}</p>
                <span className="continue-progress">Progress: In progress</span>
              </div>
              <Link className="btn-resume" to={`/read/gutenberg/${continueBook.gutenbergId}`}>Resume</Link>
            </article>
          ) : (
            <div className="no-results">
              <BookOpen size={24} />
              <p>No recent books yet.</p>
            </div>
          )}
        </section>

        <section className="desk-section" aria-label="Your shelf">
          <div className="section-heading">
            <h2>Your Shelf</h2>
          </div>
          <div className="books-grid">
            {shelfBooks.map((book) => (
              <BookCard key={book._id || String(book.gutenbergId)} book={book} to={`/read/gutenberg/${book.gutenbergId}`} />
            ))}
          </div>
        </section>

        <section className="desk-section" aria-label="Recommendations">
          <div className="section-heading">
            <h2>Recommendations</h2>
          </div>
          {recommendations.length === 0 ? (
            <div className="no-results"><p>No recommendations yet.</p></div>
          ) : (
            <div className="recommendations-row">
              {recommendations.map((book, index) => (
                <BookCard
                  key={book._id || `${book.gutenbergId || 'book'}-${index}`}
                  book={book}
                  to={book.gutenbergId ? `/read/gutenberg/${book.gutenbergId}` : '/library'}
                  compact
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default BooksLibrary;

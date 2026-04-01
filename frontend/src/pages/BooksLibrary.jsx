import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import './BooksLibrary.css';

const BooksLibrary = () => {
  return (
    <div className="library-page animate-fade-in">
      <header className="library-hero">
        <div className="library-controls">
          <p className="library-subtitle">Book listing is currently unavailable.</p>
          <Link to="/read" className="request-book-cta" aria-disabled="true">
            Add books directly in the database to continue using the reader.
          </Link>
        </div>
      </header>

      <section className="library-section">
        <div className="no-results shelf-empty">
          <BookOpen size={32} className="text-muted" />
          <h3 className="font-serif">No books to display.</h3>
          <p>This screen no longer fabricates or fetches showcase books.</p>
        </div>
      </section>
    </div>
  );
};

export default BooksLibrary;

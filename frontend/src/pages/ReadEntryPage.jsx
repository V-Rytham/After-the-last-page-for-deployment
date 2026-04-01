import React from 'react';
import { Link } from 'react-router-dom';

const ReadEntryPage = () => {
  return (
    <div className="library-page animate-fade-in">
      <section className="library-section" style={{ padding: '3rem 1.25rem' }}>
        <div className="no-results shelf-empty">
          <h1 className="font-serif">No book selected</h1>
          <p>Select a book route with an ID, or enter a Gutenberg ID to start reading.</p>
          <Link to="/request-book" className="btn-primary">
            Enter Gutenberg ID
          </Link>
        </div>
      </section>
    </div>
  );
};

export default ReadEntryPage;

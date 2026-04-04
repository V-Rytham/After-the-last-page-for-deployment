import React from 'react';
import BookCard from './BookCard';

const BookGrid = ({ books = [], loading = false, error = '' }) => {
  if (loading) {
    return (
      <div className="library-grid" role="status" aria-label="Loading books">
        {Array.from({ length: 12 }).map((_, index) => <BookCard key={`skeleton-${index}`} loading />)}
      </div>
    );
  }

  if (!loading && books.length === 0) {
    return (
      <div className="library-empty" role="status">
        {error || 'No books found'}
      </div>
    );
  }

  return (
    <div className="library-grid" role="list">
      {books.map((book) => <BookCard key={book.gutenbergId} book={book} />)}
    </div>
  );
};

export default BookGrid;

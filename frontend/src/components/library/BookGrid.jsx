import React from 'react';
import BookCard from './BookCard';

const BookGrid = ({ books = [], loading = false, error = '' }) => {
  if (loading) {
    return (
      <div className="library-grid" role="status" aria-label="Loading books">
        {Array.from({ length: 10 }).map((_, index) => <BookCard key={`skeleton-${index}`} loading />)}
      </div>
    );
  }

  if (error) {
    return <div className="library-empty" role="status">{error}</div>;
  }

  if (books.length === 0) {
    return <div className="library-empty" role="status">No books found</div>;
  }

  return (
    <div className="library-grid" role="list">
      {books.map((book) => <BookCard key={book.id || book.gutenbergId} book={book} />)}
    </div>
  );
};

export default React.memo(BookGrid);

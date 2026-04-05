import React from 'react';
import BookCardEditorial from './BookCardEditorial';

const RecommendationRow = ({ title, subtitle, books, getSessionForBook }) => (
  <section className="desk-section" aria-label="Recommendations">
    <div className="desk-section__heading">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    <div className="card-row card-row--recommendations">
      {books.map((book) => (
        <BookCardEditorial
          key={String(book?._id || book?.gutenbergId || book?.title)}
          book={book}
          session={getSessionForBook(book)}
        />
      ))}
    </div>
  </section>
);

export default RecommendationRow;

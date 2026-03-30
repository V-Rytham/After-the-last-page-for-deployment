import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import api from '../utils/api';
import BookCoverArt from '../components/books/BookCoverArt';
import './Library.css';

const LibraryPage = () => {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const { data } = await api.get('/books');
        setBooks(data);
      } catch (error) {
        console.error('Failed to fetch books:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  const filteredBooks = useMemo(() => {
    if (!searchTerm.trim()) return books;

    const term = searchTerm.toLowerCase();
    return books.filter(book =>
      book.title.toLowerCase().includes(term) ||
      book.author.toLowerCase().includes(term) ||
      (book.tags && book.tags.some(tag => tag.toLowerCase().includes(term)))
    );
  }, [books, searchTerm]);

  if (loading) {
    return (
      <div className="library-page">
        <div className="loading">Loading library...</div>
      </div>
    );
  }

  return (
    <div className="library-page">
      <div className="library-hero">
        <div className="library-copy">
          <h1 className="library-title">Library</h1>
          <p className="library-subtitle">
            Browse our complete collection of {books.length} books
          </p>
        </div>

        <div className="library-controls">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search by title, author or genre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="library-section">
        <div className="section-heading">
          <h2>All Books</h2>
          {searchTerm && (
            <p>
              {filteredBooks.length} book{filteredBooks.length !== 1 ? 's' : ''} found
            </p>
          )}
        </div>

        {filteredBooks.length === 0 ? (
          <div className="no-results">
            <p>No books found matching "{searchTerm}"</p>
          </div>
        ) : (
          <div className="books-grid">
            {filteredBooks.map((book) => (
              <BookCard key={book._id} book={book} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const BookCard = ({ book }) => {
  const bookId = book._id;

  return (
    <div className="book-card">
      <div className="book-cover-wrap" style={{ '--book-accent': book.coverColor || '#6f614d' }}>
        <BookCoverArt
          book={book}
          imgClassName="book-cover-image"
          fallbackClassName="book-cover-fallback"
          showSpine
          showPattern
          spineClassName="book-cover-spine"
          patternClassName="book-cover-pattern"
        />
      </div>

      <div className="book-info">
        <h3 className="book-title">{book.title}</h3>
        <p className="book-author">{book.author}</p>
        <div className="book-tags">
          {book.tags && book.tags.slice(0, 3).map((tag, index) => (
            <span key={index} className="book-tag">{tag}</span>
          ))}
        </div>
        <Link to={`/read/${bookId}`} className="btn-read">
          Read this book
        </Link>
      </div>
    </div>
  );
};

export default LibraryPage;
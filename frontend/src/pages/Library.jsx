import React from 'react';
import { BookOpen } from 'lucide-react';
import './Library.css';

const LibraryPage = () => {
  return (
    <div className="library-page">
      <div className="content-container library-shell">
        <div className="library-hero">
          <div className="library-copy">
            <h1 className="library-title">Library</h1>
            <p className="library-subtitle">Book listing has been removed from this client.</p>
          </div>
        </div>

        <div className="no-results">
          <BookOpen size={32} />
          <p>No books available.</p>
        </div>
      </div>
    </div>
  );
};

export default LibraryPage;

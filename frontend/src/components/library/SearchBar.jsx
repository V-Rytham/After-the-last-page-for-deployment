import React from 'react';
import { Search, X } from 'lucide-react';

const SearchBar = ({ value, onChange, onClear, onSubmit, loading = false }) => {
  const hasValue = Boolean(String(value || '').trim());

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <form className="library-search" role="search" onSubmit={handleSubmit}>
      <Search size={18} aria-hidden="true" className="library-search-icon" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by title, author, genre, or Gutenberg ID"
        aria-label="Search by title, author, genre, or Gutenberg ID"
        autoComplete="off"
      />
      <div className="library-search-actions">
        {hasValue ? (
          <button type="button" className="library-search-clear" onClick={onClear} aria-label="Clear search">
            <X size={15} />
          </button>
        ) : null}
        <button type="submit" className="library-search-submit-icon" aria-label="Search library" disabled={loading}>
          <Search size={15} />
        </button>
      </div>
    </form>
  );
};

export default SearchBar;

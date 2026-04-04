import React from 'react';
import { Search, X } from 'lucide-react';

const SearchBar = ({ value, onChange, onClear }) => {
  const hasValue = Boolean(String(value || '').trim());

  return (
    <div className="library-search" role="search">
      <Search size={18} aria-hidden="true" className="library-search-icon" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by title, author, or genre"
        aria-label="Search by title, author, or genre"
        autoComplete="off"
      />
      <div className="library-search-actions" aria-hidden="true">
        {hasValue ? (
          <button type="button" className="library-search-clear" onClick={onClear} aria-label="Clear search">
            <X size={15} />
          </button>
        ) : null}
        <span className="library-search-submit-icon">
          <Search size={15} />
        </span>
      </div>
    </div>
  );
};

export default SearchBar;

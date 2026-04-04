import React from 'react';
import { Search } from 'lucide-react';

const SearchBar = ({ value, onChange, loading = false }) => (
  <div className="library-search" role="search">
    <Search size={18} aria-hidden="true" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search by title or author"
      aria-label="Search books by title or author"
      autoComplete="off"
    />
    {loading ? <span className="library-search-status">Searching…</span> : null}
  </div>
);

export default SearchBar;

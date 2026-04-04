import React from 'react';

const SortControl = ({ sort, onSortChange }) => (
  <div className="library-sort-controls">
    <label className="library-sort-select-wrap">
      <span className="sr-only">Sort books</span>
      <select value={sort} onChange={(event) => onSortChange(event.target.value)} className="library-sort-select">
        <option value="popular">Popular</option>
        <option value="latest">Latest</option>
        <option value="title">Title</option>
      </select>
    </label>
    <button type="button" className="library-compact-toggle" aria-label="Compact view">
      Compact
    </button>
  </div>
);

export default SortControl;

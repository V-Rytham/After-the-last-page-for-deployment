import React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

const SearchBar = ({ value, onChange, onSubmit, loading = false, categories = [], activeCategory, onCategoryChange }) => {
  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit?.();
  };

  const handleStepCategory = (direction) => {
    if (!categories.length) return;
    const currentIndex = categories.findIndex((item) => item.value === activeCategory);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeIndex + direction + categories.length) % categories.length;
    onCategoryChange?.(categories[nextIndex]?.value);
  };

  return (
    <div className="search-wrapper">
      <form className="search-container" role="search" onSubmit={handleSubmit}>
        <button
          type="button"
          className="search-arrow-btn"
          onClick={() => handleStepCategory(-1)}
          aria-label="Previous category"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="search-input-wrap">
          <Search size={16} aria-hidden="true" className="search-input-icon" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Search by title, author, genre, or Gutenberg ID"
            aria-label="Search by title, author, genre, or Gutenberg ID"
            autoComplete="off"
          />
        </div>

        <div className="search-category-pills" role="tablist" aria-label="Book categories">
          {categories.map((category) => {
            const isActive = activeCategory === category.value;
            return (
              <button
                key={category.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`search-category-pill${isActive ? ' is-active' : ''}`}
                onClick={() => onCategoryChange?.(category.value)}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="search-arrow-btn"
          onClick={() => handleStepCategory(1)}
          aria-label="Next category"
        >
          <ChevronRight size={16} />
        </button>

        <button type="submit" className="search-submit-btn" aria-label="Search library" disabled={loading}>
          <Search size={16} />
        </button>
      </form>
    </div>
  );
};

export default SearchBar;

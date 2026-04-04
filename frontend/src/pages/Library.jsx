import React, { useMemo, useState } from 'react';
import SearchBar from '../components/library/SearchBar';
import FilterPills from '../components/library/FilterPills';
import SortControl from '../components/library/SortControl';
import SectionHeader from '../components/library/SectionHeader';
import BookGrid from '../components/library/BookGrid';
import { fetchLibraryBooks } from '../utils/libraryApi';
import './Library.css';

const FILTER_OPTIONS = [
  { label: 'All Books', value: 'all' },
  { label: 'Fiction', value: 'fiction' },
  { label: 'Non-fiction', value: 'non-fiction' },
  { label: 'Mystery', value: 'mystery' },
  { label: 'Classic', value: 'classic' },
  { label: 'Philosophy', value: 'philosophy' },
];

const useDebouncedValue = (value, delay = 320) => {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

const queryCache = new Map();

const useLibraryQuery = (params) => {
  const key = JSON.stringify(params);
  const [state, setState] = React.useState(() => {
    const cached = queryCache.get(key);
    if (cached) return { data: cached, loading: false, error: '' };
    return { data: null, loading: true, error: '' };
  });

  React.useEffect(() => {
    const controller = new AbortController();
    const cached = queryCache.get(key);

    if (cached) {
      setState({ data: cached, loading: false, error: '' });
    } else {
      setState((previous) => ({ ...previous, loading: true, error: '' }));
    }

    fetchLibraryBooks({ ...params, signal: controller.signal })
      .then((data) => {
        queryCache.set(key, data);
        setState({ data, loading: false, error: '' });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((previous) => ({ ...previous, loading: false, error: 'Unable to load books right now. Please try again.' }));
      });

    return () => controller.abort();
  }, [key, params]);

  return state;
};

const Library = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('popular');
  const debouncedSearch = useDebouncedValue(search);

  const queryParams = useMemo(() => ({
    search: debouncedSearch,
    category,
    sort,
    page: 1,
    perPage: 24,
  }), [debouncedSearch, category, sort]);

  const { data, loading, error } = useLibraryQuery(queryParams);

  const books = data?.books ?? [];
  const total = data?.total ?? books.length;
  const showingLabel = useMemo(() => `Showing ${books.length} of ${total}`, [books.length, total]);

  return (
    <main className="library-page content-container">
      <header className="library-page-header">
        <h1>Library</h1>
        <p>Explore 100 curated classics and timeless reads</p>
        <SearchBar value={search} onChange={setSearch} onClear={() => setSearch('')} />
      </header>

      <section className="library-controls-row" aria-label="Library controls">
        <FilterPills options={FILTER_OPTIONS} active={category} onChange={setCategory} />
        <SortControl sort={sort} onSortChange={setSort} />
      </section>

      <SectionHeader title="All Books" showingLabel={showingLabel} />

      <BookGrid books={books} loading={loading} error={error} />
    </main>
  );
};

export default Library;

import React, { useMemo, useState } from 'react';
import SearchBar from '../components/library/SearchBar';
import SortControl from '../components/library/SortControl';
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
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        const message = String(requestError?.message || '').trim() || 'Unable to load books right now. Please try again.';
        setState((previous) => ({ ...previous, loading: false, error: message }));
      });

    return () => controller.abort();
  }, [key, params]);

  return state;
};

const Library = () => {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [validationError, setValidationError] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('popular');

  const queryParams = useMemo(() => ({
    search: submittedSearch,
    category,
    sort,
    page: 1,
    perPage: 24,
  }), [submittedSearch, category, sort]);

  const { data, loading, error } = useLibraryQuery(queryParams);

  const books = data?.books ?? [];
  const normalizedSearch = String(search || '').trim();

  const handleSubmitSearch = () => {
    const next = normalizedSearch;
    if (!next) {
      setValidationError('');
      setSubmittedSearch('');
      return;
    }

    if (/^\d+$/.test(next)) {
      const parsed = Number(next);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        setValidationError('Please enter a valid positive Gutenberg ID.');
        return;
      }
    }

    setValidationError('');
    setSubmittedSearch(next);
  };

  const notFoundMessage = (!loading && !error && submittedSearch && books.length === 0)
    ? (/^\d+$/.test(submittedSearch)
      ? `No Gutenberg book found for ID ${submittedSearch}.`
      : 'No books matched your search.')
    : '';
  const statusMessage = validationError || error || notFoundMessage;

  return (
    <main className="library-page content-container">
      <header className="library-page-header">
        <h1>Library</h1>
        <SearchBar
          value={search}
          onChange={(value) => {
            setSearch(value);
            if (validationError) setValidationError('');
          }}
          onSubmit={handleSubmitSearch}
          loading={loading}
          categories={FILTER_OPTIONS}
          activeCategory={category}
          onCategoryChange={setCategory}
        />
        {validationError ? <p className="library-inline-message" role="status">{validationError}</p> : null}
      </header>

      <section className="library-controls-row" aria-label="Library controls">
        <SortControl sort={sort} onSortChange={setSort} />
      </section>

      <BookGrid books={books} loading={loading} error={statusMessage} />
    </main>
  );
};

export default Library;

import { useEffect, useMemo, useRef, useState } from 'react';
import useDebouncedValue from './useDebouncedValue';
import { getCachedSearch, setCachedSearch } from '../utils/searchCache';

const normalizeQuery = (value) => String(value || '').trim();

export default function useGlobalSearch(query) {
  const debounced = useDebouncedValue(query, 300);
  const normalized = useMemo(() => normalizeQuery(debounced), [debounced]);
  const [state, setState] = useState({ loading: false, error: '', books: [] });
  const abortRef = useRef(null);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();

    if (!normalized) {
      Promise.resolve().then(() => setState({ loading: false, error: '', books: [] }));
      return;
    }

    const cached = getCachedSearch(normalized);
    if (cached) {
      Promise.resolve().then(() => setState({ loading: false, error: '', books: cached }));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    Promise.resolve().then(() => setState((prev) => ({ ...prev, loading: true, error: '' })));

    (async () => {
      try {
        const res = await fetch(`/api/search?q=${normalized}`, { signal: controller.signal, credentials: 'include' });
        if (!res.ok) throw new Error(`API failed (${res.status})`);
        const data = await res.json();
        const books = Array.isArray(data?.books) ? data.books : [];
        setCachedSearch(normalized, books);
        Promise.resolve().then(() => setState({ loading: false, error: '', books }));
      } catch (err) {
        if (err?.name === 'AbortError') return;
        Promise.resolve().then(() => setState({ loading: false, error: err?.message || 'Search failed.', books: [] }));
      }
    })();

    return () => controller.abort();
  }, [normalized]);

  return useMemo(() => ({ ...state, query: normalized }), [normalized, state]);
}

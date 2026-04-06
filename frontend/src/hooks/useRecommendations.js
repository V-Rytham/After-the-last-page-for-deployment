import { useEffect, useMemo, useRef, useState } from 'react';

export default function useRecommendations(selectedGenres) {
  const [state, setState] = useState({ books: [], personalized: false, loading: false, error: '' });
  const abortRef = useRef(null);

  useEffect(() => {
    if (selectedGenres.length === 0) return;

    console.log('SELECTED GENRES:', selectedGenres);
    console.log('FETCHING RECOMMENDATIONS');

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    Promise.resolve().then(() => setState((prev) => ({ ...prev, loading: true, error: '' })));

    fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genres: selectedGenres }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const books = Array.isArray(data?.books) ? data.books : [];
        console.log('BOOKS RECEIVED:', books);
        Promise.resolve().then(() => setState({ books, personalized: Boolean(data?.personalized), loading: false, error: '' }));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        Promise.resolve().then(() => setState({ books: [], personalized: false, loading: false, error: err?.message || 'Failed to fetch recommendations.' }));
      });

    return () => controller.abort();
  }, [selectedGenres]);

  return useMemo(() => state, [state]);
}

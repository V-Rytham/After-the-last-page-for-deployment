import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import useGlobalSearch from '../hooks/useGlobalSearch';
import api from '../utils/api';
import './MeetingAccessHub.css';

const toList = (value) => (Array.isArray(value) ? value : []);

const normalizeBook = (book) => {
  const source = String(book?.source || '').trim().toLowerCase();
  const sourceBookId = String(book?.sourceId || '').trim();
  if (!source || !sourceBookId) return null;

  return {
    title: String(book?.title || 'Untitled').trim() || 'Untitled',
    author: String(book?.author || 'Unknown author').trim() || 'Unknown author',
    cover: String(book?.coverImage || '').trim(),
    source,
    source_book_id: sourceBookId,
  };
};

const sourceLabel = (source) => {
  if (source === 'gutendex' || source === 'gutenberg') return 'Gutendex';
  if (source === 'openlibrary') return 'Open Library';
  if (source === 'google' || source === 'googlebooks') return 'Google';
  if (source === 'archive' || source === 'internetarchive') return 'Internet Archive';
  return source || 'Source';
};

export default function MeetingAccessHub({ currentUser }) {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  const [searchTerm, setSearchTerm] = useState('');
  const [featuredBooks, setFeaturedBooks] = useState([]);
  const [joiningKey, setJoiningKey] = useState('');
  const { books, loading, error, query } = useGlobalSearch(searchTerm);

  const hasQuery = Boolean(query);
  const normalizedSearchResults = useMemo(() => toList(books).map(normalizeBook).filter(Boolean), [books]);
  const normalizedFeatured = useMemo(() => toList(featuredBooks).map(normalizeBook).filter(Boolean), [featuredBooks]);
  const visibleBooks = hasQuery ? normalizedSearchResults : normalizedFeatured;

  useEffect(() => {
    let cancelled = false;

    const loadFeaturedBooks = async () => {
      try {
        const { data } = await api.get('/books/search', { params: { q: 'classic literature' } });
        if (cancelled) return;
        setFeaturedBooks(toList(data?.results).slice(0, 12));
      } catch {
        if (!cancelled) setFeaturedBooks([]);
      }
    };

    if (isMember) {
      loadFeaturedBooks();
    }

    return () => {
      cancelled = true;
    };
  }, [isMember]);

  const handleJoinDiscussion = async (book) => {
    const key = `${book.source}:${book.source_book_id}`;
    setJoiningKey(key);
    try {
      const { data } = await api.post('/meet/join', {
        source: book.source,
        source_book_id: book.source_book_id,
        prefType: 'text',
      });

      const roomId = String(data?.room_id || data?.canonical_book_id || '').trim();
      if (!roomId) throw new Error('Could not start discussion room.');

      navigate(`/meet/${encodeURIComponent(roomId)}`, {
        state: {
          meetRoom: {
            room_id: roomId,
            canonical_book_id: roomId,
            source: book.source,
            source_book_id: book.source_book_id,
            title: String(data?.book?.title || book.title || 'Untitled'),
            author: String(data?.book?.author || book.author || 'Unknown author'),
          },
        },
      });
    } catch (joinError) {
      const message = joinError?.response?.data?.message || joinError?.response?.data?.error || joinError?.message;
      window.alert(message || 'Unable to join this discussion right now.');
    } finally {
      setJoiningKey('');
    }
  };

  if (!isMember) {
    return (
      <div className="meeting-access-page is-gated animate-fade-in">
        <section className="meeting-access-gate" aria-label="Meet">
          <h1 className="font-serif">Join conversations beyond the final page.</h1>
          <p>Sign in to meet readers anonymously by selecting a real verified book.</p>

          <div className="meeting-access-gate-actions">
            <button type="button" className="btn-primary" onClick={() => navigate('/auth')}>
              Sign in to join conversations <ArrowRight size={16} />
            </button>
          </div>

          <div className="meeting-access-gate-footnote">
            <ShieldCheck size={16} />
            <span>Anonymous by default. No identity shared from our end.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="meeting-access-page animate-fade-in">
      <section className="meeting-access-hero">
        <div className="meeting-access-hero-copy">
          <h1 className="font-serif">Meet readers in the same book discussion room.</h1>
          <p>Search, select a verified book result, and join instantly.</p>
        </div>
        <label className="meeting-access-search" htmlFor="meeting-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            id="meeting-search-input"
            type="search"
            value={searchTerm}
            placeholder="Search by title or author"
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search books to meet"
          />
        </label>
      </section>

      {error && hasQuery ? (
        <section className="meeting-access-empty glass-panel">
          <h2 className="font-serif">Unable to load books right now.</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {loading ? (
        <section className="meeting-access-results" aria-label="Loading books">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={`skeleton-${index}`} className="meeting-book-card meeting-book-card--skeleton glass-panel" aria-hidden="true">
              <div className="meeting-book-skeleton-line meeting-book-skeleton-line--title" />
              <div className="meeting-book-skeleton-line meeting-book-skeleton-line--subtitle" />
            </article>
          ))}
        </section>
      ) : null}

      {!loading && visibleBooks.length > 0 ? (
        <section className="meeting-access-results" aria-label="Meet books">
          {visibleBooks.map((book) => {
            const key = `${book.source}:${book.source_book_id}`;
            const isJoining = joiningKey === key;
            return (
              <article key={key} className="meeting-book-card glass-panel">
                <div className="meeting-book-main">
                  <h3 className="meeting-book-title" title={book.title}>{book.title}</h3>
                  <p className="meeting-book-author" title={book.author}>{book.author}</p>
                </div>
                <span className="meeting-book-source">{sourceLabel(book.source)}</span>
                <button
                  type="button"
                  className="meeting-book-cta"
                  disabled={Boolean(joiningKey)}
                  onClick={() => handleJoinDiscussion(book)}
                >
                  {isJoining ? 'Joining…' : 'Join Discussion →'}
                </button>
              </article>
            );
          })}
        </section>
      ) : null}

      {!loading && !error && hasQuery && visibleBooks.length === 0 ? (
        <section className="meeting-access-empty glass-panel">
          <h2 className="font-serif">No books found.</h2>
          <p>Try a different title or author.</p>
        </section>
      ) : null}
    </div>
  );
}

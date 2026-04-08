import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Search } from 'lucide-react';
import useGlobalSearch from '../hooks/useGlobalSearch';
import api from '../utils/api';
import './ThreadAccessHub.css';

const canonicalizeThreadKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').slice(0, 120);
};

const getArchiveBadge = (book) => {
  const source = String(book?.source || '').trim().toLowerCase();
  const isArchive = source === 'archive' || source === 'internetarchive';
  if (!isArchive) return '';
  return book?.isPublicDomain ? 'Open Access' : 'External';
};

export default function ThreadAccessHub({ currentUser }) {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  const [searchTerm, setSearchTerm] = useState('');
  const [featuredBooks, setFeaturedBooks] = useState([]);
  const { books, loading, error, query } = useGlobalSearch(searchTerm);
  const visibleSearch = useMemo(() => (Array.isArray(books) ? books : []), [books]);

  const typedQuery = String(searchTerm || '').trim();
  const hasInput = Boolean(typedQuery);
  const hasQuery = Boolean(query);
  const visible = hasInput ? visibleSearch : featuredBooks;
  const hasResults = visible.length > 0;
  const manualKey = canonicalizeThreadKey(typedQuery);
  const manualCompositeId = manualKey ? `custom:${manualKey}` : '';

  useEffect(() => {
    let cancelled = false;
    const loadFeaturedBooks = async () => {
      try {
        const { data } = await api.get('/books');
        if (cancelled) return;
        const normalized = Array.isArray(data) ? data : [];
        setFeaturedBooks(normalized.slice(0, 36).map((book) => ({
          ...book,
          source: String(book?.source || (book?.gutenbergId ? 'gutenberg' : 'local')),
          sourceId: String(book?.sourceId || book?.gutenbergId || book?._id || ''),
        })).filter((book) => book.sourceId));
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

  if (!isMember) {
    return (
      <div className="thread-access-page animate-fade-in">
        <section className="thread-access-grid">
          <div className="thread-access-loading glass-panel">
            <LockKeyhole size={18} />
            <p>Sign in to join book threads.</p>
            <button className="btn-primary sm thread-access-button" onClick={() => navigate('/auth')}>
              Sign in
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="thread-access-page animate-fade-in">
      <section className="thread-access-hero">
        <div className="thread-access-hero-row">
          <div className="thread-access-copy">
            <h1 className="font-serif">Step into the book thread.</h1>
            <p>A universal space to post threads and replies about one book.</p>
          </div>

          <label className="thread-access-search" htmlFor="thread-search-input">
            <Search size={16} aria-hidden="true" />
            <input
              id="thread-search-input"
              type="search"
              value={searchTerm}
              placeholder="Type a book title or author"
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search thread books"
            />
          </label>
        </div>
      </section>

      <section className="thread-access-grid">
        {!hasInput && (
          <div className="thread-access-loading glass-panel">
            <p>Explore threads by opening any of these featured books.</p>
          </div>
        )}

        {hasQuery && loading && (
          <div className="thread-access-loading glass-panel">
            <p>Searching…</p>
          </div>
        )}

        {hasQuery && !loading && error && (
          <div className="thread-access-loading glass-panel">
            <p>{error}</p>
          </div>
        )}

        {hasQuery && !loading && !error && !hasResults && (
          <div className="thread-access-loading glass-panel">
            <p>No matches found. You can still open a thread for “{typedQuery || query}”.</p>
          </div>
        )}

        {hasInput && manualCompositeId && (
          <article key={manualCompositeId} className="thread-access-card glass-panel">
            <div className="thread-access-card-body">
              <h3 className="thread-access-title font-serif">{typedQuery}</h3>
              <p className="thread-access-author">Open the book thread</p>
            </div>
            <div className="thread-access-actions">
              <button
                className="btn-primary sm thread-access-button"
                onClick={() => navigate(`/thread/${encodeURIComponent(manualCompositeId)}`, { state: { customTitle: typedQuery } })}
              >
                Open thread <ArrowRight size={14} />
              </button>
            </div>
          </article>
        )}

        {!loading && !error && hasResults && visible.map((book) => {
          const source = String(book?.source || '').trim().toLowerCase();
          const sourceId = String(book?.sourceId || '').trim();
          if (!source || !sourceId) return null;
          const compositeId = `${source}:${sourceId}`;
          const legacyId = String(book?.internalBookId || '').trim();
          const threadRouteId = legacyId || compositeId;

          return (
            <article key={`${source}:${sourceId}`} className="thread-access-card glass-panel">
              <div className="thread-access-card-body">
                <h3 className="thread-access-title font-serif">{book.title}</h3>
                <p className="thread-access-author">{book.author}</p>
                {getArchiveBadge(book) ? <p className="thread-access-author">{getArchiveBadge(book)}</p> : null}
              </div>
              <div className="thread-access-actions">
                <button
                  className="btn-primary sm thread-access-button"
                  onClick={() => navigate(`/thread/${encodeURIComponent(threadRouteId)}`, { state: { book } })}
                >
                  Open thread <ArrowRight size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

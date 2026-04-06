import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Search } from 'lucide-react';
import useGlobalSearch from '../hooks/useGlobalSearch';
import './ThreadAccessHub.css';

const canonicalizeThreadKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').slice(0, 120);
};

export default function ThreadAccessHub({ currentUser }) {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  const [searchTerm, setSearchTerm] = useState('');
  const { books, loading, error, query } = useGlobalSearch(searchTerm);

  const visible = useMemo(() => (Array.isArray(books) ? books : []), [books]);

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

  const typedQuery = String(searchTerm || '').trim();
  const hasInput = Boolean(typedQuery);
  const hasQuery = Boolean(query);
  const hasResults = visible.length > 0;
  const manualKey = canonicalizeThreadKey(typedQuery);
  const manualCompositeId = manualKey ? `custom:${manualKey}` : '';

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
            <p>Type a title or author to open a book thread.</p>
          </div>
        )}

        {hasQuery && loading && (
          <div className="thread-access-loading glass-panel">
            <p>Searchingâ€¦</p>
          </div>
        )}

        {hasQuery && !loading && error && (
          <div className="thread-access-loading glass-panel">
            <p>{error}</p>
          </div>
        )}

        {hasQuery && !loading && !error && !hasResults && (
          <div className="thread-access-loading glass-panel">
            <p>No matches found. You can still open a thread for â€œ{typedQuery || query}â€.</p>
          </div>
        )}

        {hasInput && manualCompositeId && (
          <article key={manualCompositeId} className="thread-access-card glass-panel">
            <div className="thread-access-mini-cover" aria-hidden="true">
              <div className="thread-access-mini-fallback">
                <span className="thread-access-mini-spine" />
              </div>
            </div>
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

        {hasQuery && !loading && !error && hasResults && visible.map((book) => {
          const source = String(book?.source || '').trim().toLowerCase();
          const sourceId = String(book?.sourceId || '').trim();
          if (!source || !sourceId) return null;
          const compositeId = `${source}:${sourceId}`;
          const legacyId = String(book?.internalBookId || '').trim();
          const threadRouteId = legacyId || compositeId;

          return (
            <article key={`${source}:${sourceId}`} className="thread-access-card glass-panel">
              <div className="thread-access-mini-cover" aria-hidden="true">
                {book.coverImage ? (
                  <img
                    className="thread-access-mini-image"
                    src={book.coverImage}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="thread-access-mini-fallback">
                    <span className="thread-access-mini-spine" />
                  </div>
                )}
              </div>
              <div className="thread-access-card-body">
                <h3 className="thread-access-title font-serif">{book.title}</h3>
                <p className="thread-access-author">{book.author}</p>
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

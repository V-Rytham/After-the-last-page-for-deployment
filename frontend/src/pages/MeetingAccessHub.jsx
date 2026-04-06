import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import useGlobalSearch from '../hooks/useGlobalSearch';
import './MeetingAccessHub.css';

const canonicalizeMeetKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').slice(0, 120);
};

export default function MeetingAccessHub({ currentUser }) {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  const [searchTerm, setSearchTerm] = useState('');
  const { books, loading, error, query } = useGlobalSearch(searchTerm);

  if (!isMember) {
    return (
      <div className="meeting-access-page is-gated animate-fade-in">
        <section className="meeting-access-gate" aria-label="Meet">
          <h1 className="font-serif">Join conversations beyond the final page.</h1>
          <p>Sign in to meet readers anonymously by the book youâ€™re thinking about.</p>

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

  const typedQuery = String(searchTerm || '').trim();
  const hasInput = Boolean(typedQuery);
  const hasQuery = Boolean(query);
  const normalizedBooks = Array.isArray(books) ? books : [];
  const visible = hasQuery ? normalizedBooks : [];
  const manualKey = canonicalizeMeetKey(typedQuery);
  const manualCompositeId = manualKey ? `custom:${manualKey}` : '';

  return (
    <div className="meeting-access-page animate-fade-in">
      <section className="meeting-access-hero">
        <div className="meeting-access-hero-row">
          <div className="meeting-access-hero-copy">
            <h1 className="font-serif">Join conversations beyond the final page.</h1>
            <p>Enter live discussions with readers whoâ€™ve read the same book.</p>
          </div>
          <label className="meeting-access-search" htmlFor="meeting-search-input">
            <Search size={16} aria-hidden="true" />
            <input
              id="meeting-search-input"
              type="search"
              value={searchTerm}
              placeholder="Type a book title or author"
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search books to meet"
            />
          </label>
        </div>
      </section>

      {hasQuery && !loading && error && (
        <section className="meeting-access-empty glass-panel">
          <h2 className="font-serif">Unable to load Meet right now.</h2>
          <p>{error}</p>
        </section>
      )}

      {hasInput && (
        <section className="meeting-access-grid" aria-label="Meet books">
          {manualCompositeId ? (
            <article key={manualCompositeId} className="meeting-access-card glass-panel meeting-access-card--manual">
              <div className="meeting-access-mini-cover" aria-hidden="true">
                <div className="meeting-access-mini-fallback">
                  <span className="meeting-access-mini-spine" />
                </div>
              </div>
              <div className="meeting-access-body">
                <h3 className="meeting-access-title font-serif">{typedQuery}</h3>
                <p className="meeting-access-author">Meet people who read this book</p>
                <span className="meeting-access-status">Instant match queue</span>
              </div>
              <button
                type="button"
                className="meeting-access-button"
                onClick={() => navigate(`/meet/${encodeURIComponent(manualCompositeId)}`, { state: { customTitle: typedQuery } })}
              >
                Open Meet <ArrowRight size={16} />
              </button>
            </article>
          ) : null}

          {hasQuery && loading ? (
            <article className="meeting-access-card glass-panel meeting-access-card--loading" aria-label="Searching">
              <div className="meeting-access-body">
                <h3 className="meeting-access-title font-serif">Searchingâ€¦</h3>
                <p className="meeting-access-author">Looking up covers and metadata.</p>
              </div>
            </article>
          ) : null}

          {!loading && !error && visible.map((book) => {
            const compositeId = `${String(book?.source || '').trim().toLowerCase()}:${String(book?.sourceId || '').trim()}`;
            if (!book?.source || !book?.sourceId) return null;

            return (
              <article key={`${book.source}:${book.sourceId}`} className="meeting-access-card glass-panel">
                <div className="meeting-access-mini-cover" aria-hidden="true">
                  {book.coverImage ? (
                    <img
                      className="meeting-access-mini-image"
                      src={book.coverImage}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="meeting-access-mini-fallback">
                      <span className="meeting-access-mini-spine" />
                    </div>
                  )}
                </div>
                <div className="meeting-access-body">
                  <h3 className="meeting-access-title font-serif">{book.title}</h3>
                  <p className="meeting-access-author">{book.author}</p>
                  <span className="meeting-access-status">Matched by book</span>
                </div>
                <button
                  type="button"
                  className="meeting-access-button"
                  onClick={() => navigate(`/meet/${encodeURIComponent(compositeId)}`)}
                >
                  Open Meet <ArrowRight size={16} />
                </button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

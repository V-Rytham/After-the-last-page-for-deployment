import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import useGlobalSearch from '../hooks/useGlobalSearch';
import api from '../utils/api';
import './MeetingAccessHub.css';

const getArchiveAccessMeta = (book) => {
  const source = String(book?.source || '').trim().toLowerCase();
  const isArchive = source === 'archive' || source === 'internetarchive';
  if (!isArchive) return { label: '', blocked: false };
  const isPublicDomain = Boolean(book?.isPublicDomain);
  return isPublicDomain
    ? { label: 'Open Access', blocked: false }
    : { label: 'External', blocked: true };
};

const canonicalizeMeetKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').slice(0, 120);
};

export default function MeetingAccessHub({ currentUser }) {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  const [searchTerm, setSearchTerm] = useState('');
  const [featuredBooks, setFeaturedBooks] = useState([]);
  const { books, loading, error, query } = useGlobalSearch(searchTerm);

  const typedQuery = String(searchTerm || '').trim();
  const hasInput = Boolean(typedQuery);
  const hasQuery = Boolean(query);
  const normalizedBooks = Array.isArray(books) ? books : [];
  const visible = hasQuery ? normalizedBooks : featuredBooks;
  const manualKey = canonicalizeMeetKey(typedQuery);
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
      <div className="meeting-access-page is-gated animate-fade-in">
        <section className="meeting-access-gate" aria-label="Meet">
          <h1 className="font-serif">Join conversations beyond the final page.</h1>
          <p>Sign in to meet readers anonymously by the book you’re thinking about.</p>

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
        <div className="meeting-access-hero-row">
          <div className="meeting-access-hero-copy">
            <h1 className="font-serif">Join conversations beyond the final page.</h1>
            <p>Enter live discussions with readers who’ve read the same book.</p>
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
              <div className="meeting-access-body">
                <h3 className="meeting-access-title font-serif">{typedQuery}</h3>
                <p className="meeting-access-author">Meet people who read this book</p>
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
                <h3 className="meeting-access-title font-serif">Searching…</h3>
                <p className="meeting-access-author">Looking up covers and metadata.</p>
              </div>
            </article>
          ) : null}

          {!loading && !error && visible.map((book) => {
            const compositeId = `${String(book?.source || '').trim().toLowerCase()}:${String(book?.sourceId || '').trim()}`;
            if (!book?.source || !book?.sourceId) return null;

            const accessMeta = getArchiveAccessMeta(book);
            return (
              <article key={`${book.source}:${book.sourceId}`} className="meeting-access-card glass-panel">
                <div className="meeting-access-body">
                  <h3 className="meeting-access-title font-serif">{book.title}</h3>
                  <p className="meeting-access-author">{book.author}</p>
                  {accessMeta.label ? <p className="meeting-access-author">{accessMeta.label}</p> : null}
                </div>
                <button
                  type="button"
                  className="meeting-access-button"
                  onClick={() => {
                    if (accessMeta.blocked) {
                      window.open(`https://archive.org/details/${encodeURIComponent(String(book?.sourceId || '').trim())}`, '_blank', 'noopener,noreferrer');
                      return;
                    }
                    navigate(`/meet/${encodeURIComponent(compositeId)}`);
                  }}
                  title={accessMeta.blocked ? 'Live reading rooms are only available for open-access books.' : 'Open Meet'}
                >
                  {accessMeta.blocked ? 'Open on Archive.org' : 'Open Meet'} <ArrowRight size={16} />
                </button>
              </article>
            );
          })}
        </section>
      )}

      {!hasInput && (
        <section className="meeting-access-grid" aria-label="Featured books for Meet">
          {visible.map((book) => {
            const accessMeta = getArchiveAccessMeta(book);
            const compositeId = `${String(book?.source || '').trim().toLowerCase()}:${String(book?.sourceId || '').trim()}`;
            if (!book?.sourceId) return null;
            return (
              <article key={`${book.source}:${book.sourceId}`} className="meeting-access-card glass-panel">
                <div className="meeting-access-body">
                  <h3 className="meeting-access-title font-serif">{book.title}</h3>
                  <p className="meeting-access-author">{book.author}</p>
                  {accessMeta.label ? <p className="meeting-access-author">{accessMeta.label}</p> : null}
                </div>
                <button
                  type="button"
                  className="meeting-access-button"
                  onClick={() => {
                    if (accessMeta.blocked) {
                      window.open(`https://archive.org/details/${encodeURIComponent(String(book?.sourceId || '').trim())}`, '_blank', 'noopener,noreferrer');
                      return;
                    }
                    navigate(`/meet/${encodeURIComponent(compositeId)}`);
                  }}
                  title={accessMeta.blocked ? 'Live reading rooms are only available for open-access books.' : 'Open Meet'}
                >
                  {accessMeta.blocked ? 'Open on Archive.org' : 'Open Meet'} <ArrowRight size={16} />
                </button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Search } from 'lucide-react';
import api from '../utils/api';
import { getBestCoverUrl } from '../utils/openLibraryCovers';
import './ThreadAccessHub.css';

const ThreadAccessHub = ({ currentUser }) => {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);
  const resolveBookId = (book) => String(book?._id || book?.id || book?.gutenbergId || '').trim();
  const [loading, setLoading] = useState(isMember);
  const [error, setError] = useState('');
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isMember) {
      setLoading(false);
      setError('');
      setBooks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    const fetchThreadBooks = async () => {
      try {
        const { data: availableBooks } = await api.get('/books');
        const normalizedBooks = Array.isArray(availableBooks) ? availableBooks : [];
        const bookIds = normalizedBooks
          .map((book) => resolveBookId(book))
          .filter(Boolean);

        if (!bookIds.length) {
          if (!cancelled) setBooks([]);
          return;
        }

        const { data: access } = await api.post('/access/check-batch', { bookIds, context: 'thread' });
        const allowed = new Set((Array.isArray(access?.allowedBookIds) ? access.allowedBookIds : []).map(String));
        const nextBooks = normalizedBooks
          .map((book) => {
            const resolvedId = resolveBookId(book);
            return { ...book, _id: resolvedId || null, coverUrl: getBestCoverUrl(book) };
          })
          .filter((book) => book._id && allowed.has(book._id));

        if (!cancelled) {
          setBooks(nextBooks);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError?.uiMessage || 'Unable to load thread rooms right now.');
          setBooks([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchThreadBooks();
    return () => { cancelled = true; };
  }, [isMember]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredBooks = useMemo(() => (
    books.filter((book) => {
      if (!normalizedSearch) return true;
      const title = String(book?.title || '').toLowerCase();
      const author = String(book?.author || '').toLowerCase();
      return title.includes(normalizedSearch) || author.includes(normalizedSearch);
    })
  ), [books, normalizedSearch]);

  const hasThreadAccess = useMemo(() => books.length > 0, [books.length]);
  const hasVisibleResults = useMemo(() => filteredBooks.length > 0, [filteredBooks.length]);

  return (
    <div className="thread-access-page animate-fade-in">
      <section className="thread-access-hero">
        <div className="thread-access-hero-row">
          <div className="thread-access-copy">
            <h1 className="font-serif">Step into the reader-only thread.</h1>
            <p>Where finished books become conversations.</p>
          </div>
          {isMember && hasThreadAccess && (
            <label className="thread-access-search" htmlFor="thread-search-input">
              <Search size={16} aria-hidden="true" />
              <input
                id="thread-search-input"
                type="search"
                value={searchTerm}
                placeholder="Search threads"
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Search thread books"
              />
            </label>
          )}
        </div>
      </section>

      <section className="thread-access-grid">
        {!isMember && (
          <div className="thread-access-loading glass-panel">
            <LockKeyhole size={18} />
            <p>Sign in to unlock reader-only threads.</p>
            <button className="btn-primary sm thread-access-button" onClick={() => navigate('/auth')}>
              Sign in
            </button>
          </div>
        )}

        {isMember && loading && (
          <div className="thread-access-loading glass-panel">
            <p>Loading your thread rooms…</p>
          </div>
        )}

        {isMember && !loading && error && (
          <div className="thread-access-loading glass-panel">
            <p>{error}</p>
            <button className="btn-secondary sm thread-access-button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        {isMember && !loading && !error && !hasThreadAccess && (
          <div className="thread-access-loading glass-panel">
            <p>No thread rooms available yet.</p>
          </div>
        )}

        {isMember && !loading && !error && hasThreadAccess && !hasVisibleResults && (
          <div className="thread-access-loading glass-panel">
            <p>No threads match “{searchTerm.trim()}”.</p>
          </div>
        )}

        {isMember && !loading && !error && hasVisibleResults && filteredBooks.map((book) => (
          <article key={book._id} className="thread-access-card glass-panel">
            <div className="thread-access-mini-cover" aria-hidden="true">
              {book.coverUrl ? (
                <img
                  className="thread-access-mini-image"
                  src={book.coverUrl}
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
              <h3 className="thread-access-title font-serif">{book.title || 'Untitled Book'}</h3>
              <p className="thread-access-author">{book.author || 'Unknown author'}</p>
            </div>
            <div className="thread-access-actions">
              <button className="btn-primary sm thread-access-button" onClick={() => navigate(`/thread/${encodeURIComponent(book._id)}`)}>
                Open thread <ArrowRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};

export default ThreadAccessHub;

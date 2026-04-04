import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole } from 'lucide-react';
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

  const hasThreadAccess = useMemo(() => books.length > 0, [books.length]);

  return (
    <div className="thread-access-page animate-fade-in">
      <section className="thread-access-hero">
        <div className="thread-access-hero-row">
          <div className="thread-access-copy">
            <h1 className="font-serif">Step into the reader-only thread.</h1>
            <p>Where finished books become conversations.</p>
          </div>
        </div>
      </section>

      <section className="thread-access-grid">
        {!isMember && (
          <div className="thread-access-loading glass-panel">
            <LockKeyhole size={18} />
            <p>Sign in to unlock reader-only threads after passing each quiz.</p>
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
            <p>No unlocked thread rooms yet. Finish a book and pass its quiz to enter.</p>
          </div>
        )}

        {isMember && !loading && !error && hasThreadAccess && books.map((book) => (
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
              <span className="thread-status unlocked">Quiz-passed thread unlocked</span>
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

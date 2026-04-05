import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import api from '../utils/api';
import { getBestCoverUrl } from '../utils/openLibraryCovers';
import './MeetingAccessHub.css';

const MeetingAccessHub = ({ currentUser }) => {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);
  const resolveBookId = (book) => String(book?._id || book?.id || book?.gutenbergId || '').trim();
  const [loading, setLoading] = useState(isMember);
  const [error, setError] = useState('');
  const [availableBooks, setAvailableBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isMember) {
      setLoading(false);
      setError('');
      setAvailableBooks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    const fetchMeetBooks = async () => {
      try {
        const { data: books } = await api.get('/books');
        const normalizedBooks = Array.isArray(books) ? books : [];
        if (!normalizedBooks.length) {
          if (!cancelled) {
            setAvailableBooks([]);
          }
          return;
        }

        const bookIds = normalizedBooks
          .map((book) => resolveBookId(book))
          .filter(Boolean);

        if (!bookIds.length) {
          if (!cancelled) {
            setAvailableBooks([]);
          }
          return;
        }

        const { data: access } = await api.post('/access/check-batch', {
          bookIds,
          context: 'meet',
        });

        const allowed = new Set((Array.isArray(access?.allowedBookIds) ? access.allowedBookIds : []).map(String));
        const filtered = normalizedBooks
          .filter((book) => allowed.has(resolveBookId(book)))
          .map((book) => ({
            ...book,
            coverUrl: getBestCoverUrl(book),
          }));

        if (!cancelled) {
          setAvailableBooks(filtered);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.uiMessage || 'Unable to load your meeting rooms right now.');
          setAvailableBooks([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchMeetBooks();
    return () => {
      cancelled = true;
    };
  }, [isMember]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredBooks = useMemo(() => (
    availableBooks.filter((book) => {
      if (!normalizedSearch) return true;
      const title = String(book?.title || '').toLowerCase();
      const author = String(book?.author || '').toLowerCase();
      return title.includes(normalizedSearch) || author.includes(normalizedSearch);
    })
  ), [availableBooks, normalizedSearch]);

  const hasRooms = useMemo(() => availableBooks.length > 0, [availableBooks.length]);
  const hasVisibleRooms = useMemo(() => filteredBooks.length > 0, [filteredBooks.length]);

  if (!isMember) {
    return (
      <div className="meeting-access-page is-gated animate-fade-in">
        <section className="meeting-access-gate" aria-label="Meet">
          <h1 className="font-serif">Join conversations beyond the final page.</h1>
          <p>Sign in to unlock discussion rooms for books you have completed.</p>

          <div className="meeting-access-gate-actions">
            <button type="button" className="btn-primary" onClick={() => navigate('/auth')}>
              Sign in to join conversations <ArrowRight size={16} />
            </button>
          </div>

          <div className="meeting-access-gate-footnote">
            <ShieldCheck size={16} />
            <span>Unlocked after completion.</span>
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
            <p>Enter live discussions, voice rooms, or debates with readers who’ve completed the same book.</p>
          </div>
          {hasRooms && (
            <label className="meeting-access-search" htmlFor="meeting-search-input">
              <Search size={16} aria-hidden="true" />
              <input
                id="meeting-search-input"
                type="search"
                value={searchTerm}
                placeholder="Search reading rooms"
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Search reading rooms"
              />
            </label>
          )}
        </div>
      </section>

      {loading && (
        <section className="meeting-access-loading glass-panel">
          <p>Loading your unlocked meeting rooms…</p>
        </section>
      )}

      {!loading && error && (
        <section className="meeting-access-empty glass-panel">
          <h2 className="font-serif">Unable to load Meet right now.</h2>
          <p>{error}</p>
          <button type="button" className="btn-secondary sm" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      )}

      {!loading && !error && !hasRooms && (
        <section className="meeting-access-empty glass-panel">
          <h2 className="font-serif">No unlocked rooms yet.</h2>
          <p>No meeting rooms are available right now.</p>
        </section>
      )}

      {!loading && !error && hasRooms && !hasVisibleRooms && (
        <section className="meeting-access-empty glass-panel">
          <h2 className="font-serif">No matching reading rooms.</h2>
          <p>Try a different title or author.</p>
        </section>
      )}

      {!loading && !error && hasVisibleRooms && (
        <section className="meeting-access-grid" aria-label="Unlocked meet books">
          {filteredBooks.map((book) => {
            const bookId = resolveBookId(book);
            if (!bookId) return null;

            return (
              <article key={bookId} className="meeting-access-card glass-panel">
                <div className="meeting-access-mini-cover" aria-hidden="true">
                  {book.coverUrl ? (
                    <img
                      className="meeting-access-mini-image"
                      src={book.coverUrl}
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
                  <h3 className="meeting-access-title font-serif">{book.title || 'Untitled Book'}</h3>
                  <p className="meeting-access-author">{book.author || 'Unknown author'}</p>
                  <span className="meeting-access-status">Unlocked after completion</span>
                </div>
                <button
                  type="button"
                  className="meeting-access-button"
                  onClick={() => navigate(`/meet/${encodeURIComponent(bookId)}`)}
                >
                  Join Discussion
                </button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
};

export default MeetingAccessHub;

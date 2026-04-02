import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import api from '../utils/api';
import { getBestCoverUrl } from '../utils/openLibraryCovers';
import './MeetingAccessHub.css';

const MeetingAccessHub = ({ currentUser }) => {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);
  const [loading, setLoading] = useState(isMember);
  const [error, setError] = useState('');
  const [availableBooks, setAvailableBooks] = useState([]);

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
          .map((book) => String(book?._id || book?.id || '').trim())
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
          .filter((book) => allowed.has(String(book?._id || book?.id || '')))
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

  const hasRooms = useMemo(() => availableBooks.length > 0, [availableBooks.length]);

  if (!isMember) {
    return (
      <div className="meeting-access-page is-gated animate-fade-in">
        <section className="meeting-access-gate" aria-label="Meet">
          <h1 className="font-serif">Private discussions for readers who reached the last page.</h1>
          <p>Sign in to access your completed books and join anonymous conversations.</p>

          <div className="meeting-access-gate-actions">
            <button type="button" className="btn-primary" onClick={() => navigate('/auth')}>
              Sign in to join conversations <ArrowRight size={16} />
            </button>
          </div>

          <div className="meeting-access-gate-footnote">
            <ShieldCheck size={16} />
            <span>Only finished books appear here.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="meeting-access-page animate-fade-in">
      <section className="meeting-access-hero">
        <h1 className="font-serif">Meet fellow readers who reached the final page.</h1>
        <p>Choose a completed book to enter text, voice, or video matchmaking.</p>
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
          <p>Pass a book quiz to unlock Meet for that title, then return here.</p>
        </section>
      )}

      {!loading && !error && hasRooms && (
        <section className="meeting-access-grid" aria-label="Unlocked meet books">
          {availableBooks.map((book) => {
            const bookId = book?._id || book?.id;
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
                  <span className="meeting-access-status">
                    <Sparkles size={12} />
                    Meet unlocked
                  </span>
                  <h3 className="meeting-access-title font-serif">{book.title || 'Untitled Book'}</h3>
                  <p className="meeting-access-author">{book.author || 'Unknown author'}</p>
                </div>
                <button
                  type="button"
                  className="meeting-access-button"
                  onClick={() => navigate(`/meet/${encodeURIComponent(bookId)}`)}
                >
                  Enter Meet
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

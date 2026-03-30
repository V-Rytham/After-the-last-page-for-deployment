import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole, MessageSquare } from 'lucide-react';
import api from '../utils/api';
import { getFallbackBooks } from '../utils/bookFallback';
import BookCoverArt from '../components/books/BookCoverArt';
import './ThreadAccessHub.css';

const ThreadAccessHub = ({ currentUser }) => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  const getDisplayTitle = (title) => String(title || '').split(':')[0].split(';')[0].trim();

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const { data } = await api.get('/books');
        setBooks(data);
      } catch (error) {
        console.error('Failed to fetch books for thread access, using fallback:', error);
        setBooks(getFallbackBooks());
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  const bookCards = useMemo(
    () =>
      books.map((book) => ({ book })),
    [books],
  );

  const handleThreadAccess = async (book) => {
    if (!isMember) {
      navigate('/auth');
      return;
    }

    const bookId = book._id || book.id;

    try {
      const { data } = await api.get(`/access/check?bookId=${encodeURIComponent(bookId)}`);
      if (data?.access) {
        navigate(`/thread/${bookId}`, {
          state: {
            notice: `Welcome back. You have full access to ${book.title}'s thread.`,
          },
        });
        return;
      }

      navigate(`/quiz/${encodeURIComponent(bookId)}`, { state: { from: `/thread/${bookId}` } });
    } catch {
      setNotice({
        type: 'warning',
        title: 'Access check failed',
        message: 'Unable to verify access right now. Please try again.',
        actionLabel: 'Retry',
        action: () => handleThreadAccess(book),
      });
    }
  };

  return (
    <div className="thread-access-page animate-fade-in">
      <section className="thread-access-hero">
        <div className="thread-access-copy">
          <div className="thread-access-badge glass-panel">
            <MessageSquare size={16} />
            <span>Reader discussion access</span>
          </div>
          <h1 className="font-serif">Step into the reader-only thread.</h1>
          <p>Pass a short quiz and join the calm conversation.</p>
        </div>
      </section>

      {notice && (
        <div className={`thread-access-notice ${notice.type}`}>
          <div className="thread-access-notice-copy">
            <strong>{notice.title}</strong>
            <p>{notice.message}</p>
          </div>
          <div className="thread-access-notice-actions">
            <button className="btn-primary" onClick={notice.action}>
              {notice.actionLabel}
            </button>
            <button className="btn-secondary" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <section className="thread-access-grid">
        {loading ? (
          <div className="thread-access-loading glass-panel">Loading thread rooms...</div>
        ) : (
          bookCards.map(({ book }) => {
            const bookId = book._id || book.id;
            const status = isMember
              ? {
                  label: 'Quiz unlock',
                  icon: <LockKeyhole size={16} />,
                  className: 'read-required',
                }
              : {
                  label: 'Sign in required',
                  icon: <LockKeyhole size={16} />,
                  className: 'read-required',
                };

            return (
              <article key={bookId} className="thread-access-card glass-panel">
                <div className="thread-access-mini-cover" style={{ '--book-accent': book.coverColor || '#6f614d' }}>
                  <BookCoverArt
                    book={book}
                    imgClassName="thread-access-mini-image"
                    fallbackClassName="thread-access-mini-fallback"
                    showSpine
                    showPattern={false}
                    spineClassName="thread-access-mini-spine"
                  />
                </div>

                <div className="thread-access-card-body">
                  <h2 className="font-serif thread-access-title" title={book.title}>
                    {getDisplayTitle(book.title)}
                  </h2>
                  <p className="thread-access-author" title={book.author}>{book.author}</p>
                </div>

                <div className="thread-access-actions">
                  <span className={`thread-status ${status.className}`}>
                    {status.icon}
                    {status.label}
                  </span>

                  <button className="btn-primary sm thread-access-button" onClick={() => handleThreadAccess(book)}>
                    {!isMember ? 'Sign in' : 'Enter'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
};

export default ThreadAccessHub;

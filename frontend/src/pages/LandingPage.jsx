import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, MoveRight } from 'lucide-react';
import api from '../utils/api';
import { getFallbackBooks } from '../utils/bookFallback';
import { getLibraryState } from '../utils/readingSession';
import BookCoverArt from '../components/books/BookCoverArt';
import './LandingPage.css';

const getBookId = (book) => book._id || book.id;

const renderCover = (book) => (
  <BookCoverArt
    book={book}
    imgClassName="home-cover-image compact"
    fallbackClassName="home-cover-fallback compact"
    showSpine
    showPattern={false}
    spineClassName="home-cover-spine"
    patternClassName="home-cover-pattern"
  />
);

const FeaturedBook = ({ book, isMember }) => (
  <Link to={isMember ? `/read/${getBookId(book)}` : '/auth'} className="home-featured-link" aria-label={`Open ${book.title}`}>
    <article className="home-featured-book">
      <div className="home-featured-cover" style={{ '--book-accent': book.coverColor || '#6f614d' }}>
        {renderCover(book)}
        <span className="home-featured-overlay" aria-hidden="true">Start reading →</span>
      </div>
      <div className="home-featured-copy">
        <h3 className="font-serif">{book.title}</h3>
        <p>{book.author}</p>
      </div>
    </article>
  </Link>
);

const DiscussionEntry = ({ thread }) => (
  <Link to={`/thread/${thread.bookId}#${thread._id}`} className="home-discussion-card-link">
    <article className="home-discussion-card">
      <div className="home-discussion-card-live">
        <span className="home-live-dot" aria-hidden="true" />
        <span>Active</span>
      </div>
      <h3 className="font-serif">{thread.title}</h3>
      <p>{thread.bookTitle || 'Shared reading'} · {thread.replyCount} replies</p>
      <span className="home-discussion-card-cta">Open →</span>
    </article>
  </Link>
);

const getResumeProgressLabel = (book) => {
  if (!book) {
    return 'Continue from where you left off.';
  }

  if (typeof book.progressPercent === 'number') {
    return `${Math.round(book.progressPercent)}% complete`;
  }

  if (typeof book.progress === 'number') {
    return `${Math.round(book.progress)}% complete`;
  }

  return 'Continue from where you left off.';
};

export default function LandingPage({ currentUser }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sampleThreads, setSampleThreads] = useState([]);
  const [threadError, setThreadError] = useState(false);

  const isMember = Boolean(currentUser && !currentUser.isAnonymous);
  const threadPreviewCount = isMember ? 3 : 6;

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const { data } = await api.get('/books');
        setBooks(data);
      } catch (error) {
        console.error('Failed to fetch books, using local fallback:', error);
        setBooks(getFallbackBooks());
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  const recommendedBooks = useMemo(() => books.slice(0, 10), [books]);
  const recentActivityBooks = useMemo(() => books.slice(2, 12), [books]);

  const resumeBook = useMemo(() => {
    if (!isMember || books.length === 0) {
      return null;
    }

    const libraryState = getLibraryState(books);
    return libraryState.continueReading[0] || libraryState.recentlyOpened[0] || null;
  }, [books, isMember]);

  useEffect(() => {
    let isActive = true;

    const fetchSampleThreads = async () => {
      if (!isMember || books.length === 0) {
        if (isActive) {
          setSampleThreads([]);
          setThreadError(false);
        }
        return;
      }

      try {
        const booksToScan = books.slice(0, 6);
        const threadResponses = await Promise.allSettled(
          booksToScan.map((book) => api.get(`/threads/${getBookId(book)}?sort=hot`)),
        );

        const candidateThreads = threadResponses.flatMap((result, index) => {
          if (result.status !== 'fulfilled' || !Array.isArray(result.value?.data)) {
            return [];
          }

          const sourceBook = booksToScan[index];
          return result.value.data.map((thread) => {
            const commentCount = Array.isArray(thread.comments) ? thread.comments.length : 0;
            return {
              ...thread,
              bookTitle: sourceBook?.title || thread.bookTitle || 'Shared reading',
              replyCount: Number.isFinite(thread.replyCount) ? thread.replyCount : commentCount,
            };
          });
        });

        const sortedPreview = candidateThreads
          .sort((a, b) => {
            const scoreDiff = Number(b.likes || 0) - Number(a.likes || 0);
            if (scoreDiff !== 0) {
              return scoreDiff;
            }
            return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
          })
          .slice(0, threadPreviewCount);

        if (!isActive) {
          return;
        }

        setSampleThreads(sortedPreview);
        setThreadError(false);
      } catch (error) {
        if (!isActive) {
          return;
        }
        console.error('Failed to load sample threads for home page:', error);
        setSampleThreads([]);
        setThreadError(true);
      }
    };

    fetchSampleThreads();
    return () => {
      isActive = false;
    };
  }, [books, isMember, threadPreviewCount]);

  if (loading) {
    return (
      <div className="home-page animate-fade-in">
        <div className="layout-shell home-shell">
          <div className="layout-content">
            <p className="home-status">Preparing the reading desk...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page animate-fade-in">
      <div className="layout-shell home-shell">
        <header className="layout-section home-hero" aria-label="Home">
          <div className="layout-content home-hero-inner">
            <div className="home-hero-copy home-hero-centered">
              <h1 className="home-title font-serif">
                <span className="home-title-line">Finish the book.</span>
                <span className="home-title-line">Enter the conversation.</span>
              </h1>

              <p className="home-subtitle">
                Read in calm focus. Then unpack the ending with readers who finished the same book.
              </p>

              <div className="home-hero-actions">
                <Link
                  to={isMember ? (resumeBook ? `/read/${getBookId(resumeBook)}` : '/desk') : '/auth'}
                  className="btn-primary"
                >
                  Start Reading <MoveRight size={16} />
                </Link>
                <Link to="/threads" className="btn-secondary">Explore discussions</Link>
              </div>

              <p className="home-trust-line">No noise. No spoilers. Just meaningful conversations.</p>

              {!isMember && (
                <p className="home-signin-hint">
                  Rooms unlock per book after a quick 5-question check — <Link to="/auth">sign in</Link> to keep your place across visits.
                </p>
              )}
            </div>
          </div>
        </header>

        <div className="layout-content">
          <div className="home-hero-divider" aria-hidden="true" />
        </div>

        <section className="layout-section home-progress" aria-label="Continue reading">
          <div className="layout-content home-progress-inner surface-card">
            {isMember && resumeBook ? (
              <div className="home-resume">
                <div className="home-resume-cover" style={{ '--book-accent': resumeBook.coverColor || '#6f614d' }}>
                  {renderCover(resumeBook)}
                </div>
                <div className="home-resume-copy">
                  <p className="home-kicker">Continue reading</p>
                  <h2 className="font-serif">{resumeBook.title}</h2>
                  <p className="home-resume-author">{resumeBook.author}</p>
                  <p className="home-resume-progress">{getResumeProgressLabel(resumeBook)} · Pick up where you left off.</p>
                </div>
                <Link to={`/read/${getBookId(resumeBook)}`} className="btn-primary sm">Resume</Link>
              </div>
            ) : isMember ? (
              <div className="home-callout">
                <div className="home-callout-copy">
                  <h2 className="font-serif">Pick up a book.</h2>
                  <p>Choose a story from your desk. Discussion rooms unlock after you finish.</p>
                </div>
                <Link to="/desk" className="btn-primary sm">Go to desk</Link>
              </div>
            ) : (
              <div className="home-callout">
                <div className="home-callout-copy">
                  <h2 className="font-serif">Keep your place.</h2>
                  <p>Sign in to save progress and unlock reader-only conversation rooms after you finish.</p>
                </div>
                <Link to="/auth" className="btn-primary sm">Sign in</Link>
              </div>
            )}
          </div>
        </section>

        <div className="layout-content home-sections">
          <section className="home-section home-carousel-section" aria-labelledby="recommended-heading">
            <div className="home-section-head">
              <div className="home-section-copy">
                <h2 id="recommended-heading" className="font-serif">Recommended</h2>
                <p>Pick a book. The conversation will be waiting when you return.</p>
              </div>
              <Link to={isMember ? '/desk' : '/auth'} className="home-section-link">View all</Link>
            </div>

            <div className="home-scroll-fade">
              <div className="home-featured" role="list" aria-label="Recommended books">
                {recommendedBooks.map((book) => (
                  <FeaturedBook key={`recommended-${getBookId(book)}`} book={book} isMember={isMember} />
                ))}
              </div>
            </div>
          </section>

          <section className="home-section home-carousel-section" aria-labelledby="recent-activity-heading">
            <div className="home-section-head">
              <div className="home-section-copy">
                <h2 id="recent-activity-heading" className="font-serif">Recent activity</h2>
                <p>Continue exploring titles readers recently opened and finished.</p>
              </div>
              <Link to={isMember ? '/library' : '/auth'} className="home-section-link">Open library</Link>
            </div>

            <div className="home-scroll-fade">
              <div className="home-featured" role="list" aria-label="Recent activity books">
                {recentActivityBooks.map((book) => (
                  <FeaturedBook key={`recent-${getBookId(book)}`} book={book} isMember={isMember} />
                ))}
              </div>
            </div>
          </section>

          <section className="home-section home-discussion-preview" aria-labelledby="sample-discussions-heading">
            <div className="home-section-head">
              <div className="home-section-copy">
                <p className="home-live-kicker">Conversations happening right now</p>
                <h2 id="sample-discussions-heading" className="font-serif">Discussion entry</h2>
                <p>Recent threads from readers who just closed the book.</p>
              </div>
              <Link to="/threads" className="home-section-link">Join the conversation</Link>
            </div>

            {sampleThreads.length > 0 ? (
              <div className="home-discussions" role="list" aria-label="Sample discussions">
                {sampleThreads.map((thread) => (
                  <DiscussionEntry key={thread._id} thread={thread} />
                ))}
              </div>
            ) : (
              <div className="home-empty">
                <div className="home-empty-icon" aria-hidden="true">
                  <MessageSquare size={18} />
                </div>
                <h3 className="font-serif">No active discussions yet</h3>
                <p>
                  {threadError
                    ? 'Discussion rooms are unavailable right now.'
                    : 'Open a book and return after you finish to see active discussions.'}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, MessageSquare, MoveRight, Users } from 'lucide-react';
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

const howItWorksSteps = [
  { key: 'read', title: 'Read in silence', description: 'A quiet reading space designed for focus.', icon: BookOpen },
  { key: 'finish', title: 'Mark the moment', description: 'Finish the book to unlock its discussion room.', icon: Check },
  { key: 'discuss', title: 'Enter the room', description: 'Join conversations with readers who finished it too.', icon: Users },
];

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
  const [isHowVisible, setIsHowVisible] = useState(false);
  const [isHowAnimReady, setIsHowAnimReady] = useState(false);
  const howItWorksRef = useRef(null);

  const isMember = Boolean(currentUser && !currentUser.isAnonymous);
  const threadPreviewCount = isMember ? 2 : 6;

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

  const featuredBooks = useMemo(() => books.slice(0, 8), [books]);

  const resumeBook = useMemo(() => {
    if (!isMember || books.length === 0) {
      return null;
    }

    const libraryState = getLibraryState(books);
    return libraryState.continueReading[0] || libraryState.recentlyOpened[0] || null;
  }, [books, isMember]);

  useEffect(() => {
    setSampleThreads([]);
    setThreadError(false);
  }, [books, threadPreviewCount]);

  useEffect(() => {
    const section = howItWorksRef.current;
    if (!section) {
      return undefined;
    }

    if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      setIsHowVisible(true);
      setIsHowAnimReady(false);
      return undefined;
    }

    setIsHowAnimReady(true);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsHowVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

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

        <section className="layout-section home-progress home-progress-priority home-progress-full surface-card" aria-label="Continue reading">
          <div className="layout-content home-progress-inner">
            {isMember && resumeBook ? (
            <div className="home-resume">
              <div className="home-resume-cover" style={{ '--book-accent': resumeBook.coverColor || '#6f614d' }}>
                {renderCover(resumeBook)}
              </div>
              <div className="home-resume-copy">
                <span className="home-resume-kicker">Continue reading</span>
                <h2 className="font-serif">{resumeBook.title}</h2>
                <p>{resumeBook.author || 'Unknown author'}</p>
                <span className="home-resume-progress">{getResumeProgressLabel(resumeBook)}</span>
              </div>
              <Link to={`/read/${getBookId(resumeBook)}`} className="btn-primary sm">
                Resume <MoveRight size={16} />
              </Link>
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
        <section className="home-section home-shelf-section" aria-labelledby="featured-heading">
          <div className="home-section-head">
            <div className="home-section-copy">
              <h2 id="featured-heading" className="font-serif">A place to begin</h2>
              <p>Pick a book. The conversation will be waiting when you return.</p>
            </div>
            <Link to={isMember ? '/desk' : '/auth'} className="home-section-link">View all</Link>
          </div>

          <div className="home-featured" role="list" aria-label="Featured books">
            {featuredBooks.map((book) => (
              <FeaturedBook key={getBookId(book)} book={book} isMember={isMember} />
            ))}
          </div>
        </section>

        <section className="home-section home-discussion-preview" aria-labelledby="sample-discussions-heading">
          <div className="home-section-head">
            <div className="home-section-copy">
              <p className="home-live-kicker">Conversations happening right now</p>
              <h2 id="sample-discussions-heading" className="font-serif">From the discussion rooms</h2>
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
              <MessageSquare size={18} />
              <p>
                {threadError
                  ? 'Discussion rooms are unavailable right now.'
                  : 'Open a book and return after you finish to see active discussions.'}
              </p>
            </div>
          )}
        </section>

        <section className="home-how-it-works" aria-labelledby="how-it-works-heading" ref={howItWorksRef}>
          <h2 id="how-it-works-heading" className="home-how-heading">How it works</h2>
          <div
            className={`home-how-grid ${isHowAnimReady ? 'animate-ready' : ''} ${isHowVisible ? 'visible' : ''}`.trim()}
            role="list"
            aria-label="How it works steps"
          >
            {howItWorksSteps.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <article
                  key={step.key}
                  className="home-how-card"
                  role="listitem"
                  style={{ transitionDelay: `${120 * index}ms` }}
                >
                  <span className="home-how-step" aria-hidden="true">{index + 1}</span>
                  <span className="home-how-icon" aria-hidden="true">
                    <StepIcon size={16} strokeWidth={2.1} />
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              );
            })}
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}

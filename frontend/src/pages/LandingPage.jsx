import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  MessageCircle,
  Mic,
  MoveRight,
  Shirt,
  Sparkles,
  Users,
} from 'lucide-react';
import { getBestCoverUrl } from '../utils/openLibraryCovers';
import api from '../utils/api';
import { getReadingSessionsForCurrentUser } from '../utils/readingSession';
import './LandingPage.css';

const experienceSignals = [
  {
    key: 'read',
    title: 'Immersive Reading',
    description: 'A clean reading space that remembers exactly where you paused.',
    icon: BookOpen,
  },
  {
    key: 'people',
    title: 'Meet People',
    description: 'After finishing, connect anonymously through text, voice, or video.',
    icon: Users,
  },
  {
    key: 'threads',
    title: 'BookThread',
    description: 'Book-specific threads where every reply comes from someone who read it.',
    icon: MessageCircle,
  },
  {
    key: 'wizard',
    title: 'Wizard Merch',
    description: 'Generate custom apparel inspired by books that stayed with you.',
    icon: Shirt,
  },
];

const getProgressCandidate = (books, sessions) => {
  if (!Array.isArray(books) || !sessions || typeof sessions !== 'object') return null;

  return books
    .map((book) => {
      const keys = [String(book?._id || ''), String(book?.id || ''), String(book?.gutenbergId || '')].filter(Boolean);
      const session = keys.map((key) => sessions[key]).find(Boolean);
      if (!session) return null;

      const progress = Number(session?.progressPercent || 0);
      if (!Number.isFinite(progress) || progress <= 0 || progress >= 100 || session?.isFinished) return null;

      return {
        book,
        session,
        progress: Math.max(1, Math.min(99, Math.round(progress))),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.session?.lastOpenedAt || 0).getTime() - new Date(a.session?.lastOpenedAt || 0).getTime())[0] || null;
};

const resolveBookId = (book) => String(book?._id || book?.id || book?.gutenbergId || '').trim();

const getBookRoute = (book) => {
  if (!book) return '/desk';
  if (book?._id || book?.id) return `/read/${book._id || book.id}`;
  if (book?.gutenbergId) return `/read/gutenberg/${book.gutenbergId}`;
  return '/desk';
};

const ExperienceCard = ({ icon: Icon, title, description }) => (
  <article className="home-signal-card">
    <div className="home-signal-icon" aria-hidden="true">
      <Icon size={16} />
    </div>
    <h3 className="font-serif">{title}</h3>
    <p>{description}</p>
  </article>
);

export default function LandingPage({ currentUser }) {
  const [books, setBooks] = useState([]);
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  useEffect(() => {
    let mounted = true;

    const loadBooks = async () => {
      try {
        const { data } = await api.get('/books');
        if (mounted) setBooks(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('[HOME] Failed to load books', error);
        if (mounted) setBooks([]);
      }
    };

    loadBooks();
    return () => {
      mounted = false;
    };
  }, []);

  const readingSessions = useMemo(() => (
    isMember ? getReadingSessionsForCurrentUser() : {}
  ), [isMember]);

  const activeProgress = useMemo(() => getProgressCandidate(books, readingSessions), [books, readingSessions]);

  const continueReadingRoute = useMemo(() => getBookRoute(activeProgress?.book), [activeProgress]);

  const heroCover = useMemo(() => getBestCoverUrl(activeProgress?.book || books[0] || null), [activeProgress, books]);

  const recentlyViewedBooks = useMemo(() => {
    if (!isMember || !readingSessions || typeof readingSessions !== 'object') return [];

    const mapped = books
      .map((book) => {
        const key = resolveBookId(book);
        if (!key) return null;
        const session = readingSessions[key];
        if (!session) return null;

        return {
          book,
          lastOpenedAt: new Date(session?.lastOpenedAt || 0).getTime(),
          progress: Math.round(Number(session?.progressPercent || 0)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

    return mapped.slice(0, 3);
  }, [books, isMember, readingSessions]);

  const trendingBooks = useMemo(() => books.slice(0, 3), [books]);

  const popularDiscussions = useMemo(() => (
    books.slice(0, 3).map((book, index) => ({
      key: resolveBookId(book) || `${book?.title}-${index}`,
      title: book?.title || 'Untitled Book',
      topic: `Readers are discussing ${book?.author ? `themes from ${book.author}` : 'the ending and key moments'}.`,
    }))
  ), [books]);

  return (
    <div className="home-page animate-fade-in">
      <div className="layout-shell home-shell">
        <section className="layout-content home-hero" aria-label="Home hero">
          <div className="home-hero-copy">
            <p className="home-eyebrow">After the Last Page</p>
            <h1 className="home-title font-serif">Where reading becomes connection.</h1>
            <p className="home-subtitle">
              Finish a chapter in calm, then continue the story with people who felt the same pages.
            </p>
            <div className="home-actions">
              <Link to={isMember ? continueReadingRoute : '/auth'} className="home-btn home-btn-primary">
                {isMember ? 'Continue Reading' : 'Start Reading'} <MoveRight size={15} />
              </Link>
              <Link to="/meet" className="home-btn home-btn-secondary">Discover People</Link>
            </div>
          </div>

          <div className="home-hero-art" aria-hidden="true">
            <div className="home-orb" />
            <div className="home-floating-cover">
              {heroCover ? <img src={heroCover} alt="" loading="eager" decoding="async" /> : <span className="font-serif">ATLP</span>}
            </div>
          </div>
        </section>

        <section className="layout-content home-signals" aria-label="Experience preview">
          {experienceSignals.map((item) => (
            <ExperienceCard key={item.key} icon={item.icon} title={item.title} description={item.description} />
          ))}
        </section>

        <section className="layout-content home-after-book" aria-label="After you finish a book">
          <div className="home-after-copy">
            <p className="home-eyebrow">After you finish a book…</p>
            <h2 className="font-serif">The last line lands. The feeling stays.</h2>
            <p>
              Instead of closing the tab, meet another reader who reached the same final page and wants to talk about it.
            </p>
          </div>
          <div className="home-connection" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <Link to="/meet" className="home-btn home-btn-primary">Meet Readers <Mic size={15} /></Link>
        </section>

        <section className="layout-content home-dynamic" aria-label="Personalized feed">
          <div className="home-dynamic-head">
            <p className="home-eyebrow">Your entry point</p>
            <h2 className="font-serif">{isMember ? 'Pick up where you left off.' : 'Explore what readers are opening now.'}</h2>
          </div>

          {isMember ? (
            <div className="home-dynamic-grid home-dynamic-grid-member">
              <article className="home-dynamic-card home-dynamic-continue">
                <p className="home-label">Continue</p>
                <h3 className="font-serif">{activeProgress?.book?.title || 'Resume your reading flow'}</h3>
                <p>{activeProgress ? `${activeProgress.progress}% complete` : 'Return to your reading desk and continue your latest book.'}</p>
                <Link to={continueReadingRoute} className="home-inline-link">Open Reader <MoveRight size={14} /></Link>
              </article>

              <article className="home-dynamic-card">
                <p className="home-label">Recently viewed</p>
                <ul className="home-list">
                  {recentlyViewedBooks.length > 0 ? recentlyViewedBooks.map(({ book, progress }) => (
                    <li key={resolveBookId(book) || book?.title}>
                      <span>{book?.title || 'Untitled Book'}</span>
                      <span>{Number.isFinite(progress) ? `${Math.max(0, progress)}%` : 'In progress'}</span>
                    </li>
                  )) : <li><span>No recent books yet</span><span>—</span></li>}
                </ul>
              </article>

              <article className="home-dynamic-card">
                <p className="home-label">Shortcuts</p>
                <div className="home-shortcuts">
                  <Link to="/meet" className="home-btn home-btn-secondary">Meet people</Link>
                  <Link to="/threads" className="home-btn home-btn-secondary">BookThread</Link>
                  <Link to="/merch" className="home-btn home-btn-secondary">Wizard Merch</Link>
                </div>
              </article>
            </div>
          ) : (
            <div className="home-dynamic-grid home-dynamic-grid-guest">
              <article className="home-dynamic-card">
                <p className="home-label">Trending books</p>
                <ul className="home-list">
                  {trendingBooks.length > 0 ? trendingBooks.map((book, index) => (
                    <li key={resolveBookId(book) || `${book?.title}-${index}`}>
                      <span>{book?.title || 'Untitled Book'}</span>
                      <span>{book?.author || 'Reader pick'}</span>
                    </li>
                  )) : <li><span>Library updates soon</span><span>—</span></li>}
                </ul>
              </article>

              <article className="home-dynamic-card">
                <p className="home-label">Popular discussions</p>
                <ul className="home-topic-list">
                  {popularDiscussions.length > 0 ? popularDiscussions.map((item) => (
                    <li key={item.key}>
                      <h3 className="font-serif">{item.title}</h3>
                      <p>{item.topic}</p>
                    </li>
                  )) : <li><p>Thread highlights will appear here.</p></li>}
                </ul>
              </article>

              <article className="home-dynamic-card home-signup-card">
                <Sparkles size={17} aria-hidden="true" />
                <h3 className="font-serif">Sign up to unlock the full reading experience.</h3>
                <Link to="/auth" className="home-btn home-btn-primary">Sign up</Link>
              </article>
            </div>
          )}
        </section>

        <section className="layout-content home-endcap" aria-label="Closing note">
          <p className="font-serif">Built for the moment after the last page.</p>
        </section>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBestCoverUrl } from '../utils/openLibraryCovers';
import api from '../utils/api';
import { getReadingSessionsForCurrentUser } from '../utils/readingSession';
import './LandingPage.css';

const featureCards = [
  {
    key: 'immersive-reading',
    title: 'Immersive Reading',
    description: 'Distraction-free chapters with fluid progress tracking.',
    lightVariant: 'reading-experience',
    darkVariant: 'wide',
  },
  {
    key: 'shared-margins',
    title: 'Shared Margins',
    description: 'Leave thoughtful notes and revisit meaningful passages together.',
    lightVariant: 'shared-margins',
    darkVariant: 'small',
  },
  {
    key: 'insights',
    title: 'Insights',
    description: 'Spot themes and motifs surfaced from your reading journey.',
    lightVariant: 'shared-margins',
    darkVariant: 'small',
  },
  {
    key: 'community',
    title: 'Community',
    description: 'Join readers who reached the same ending, then unpack it deeply.',
    lightVariant: 'reading-experience',
    darkVariant: 'large',
  },
];

const getProgressCandidate = (books, sessions) => {
  if (!Array.isArray(books) || !sessions || typeof sessions !== 'object') return null;

  return books
    .map((book) => {
      const keys = [
        String(book?._id || ''),
        String(book?.id || ''),
        String(book?.gutenbergId || ''),
      ].filter(Boolean);

      const session = keys.map((key) => sessions[key]).find(Boolean);
      if (!session) return null;

      const progress = Number(session?.progressPercent || 0);
      if (!Number.isFinite(progress) || progress <= 0 || progress >= 100 || session?.isFinished) {
        return null;
      }

      return {
        book,
        session,
        progress: Math.max(1, Math.min(99, Math.round(progress))),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.session?.lastOpenedAt || 0).getTime() - new Date(a.session?.lastOpenedAt || 0).getTime())[0] || null;
};

export default function LandingPage({ currentUser }) {
  const [books, setBooks] = useState([]);
  const [uiTheme, setUiTheme] = useState(() => (typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') || 'dark' : 'dark'));

  const isMember = Boolean(currentUser && !currentUser.isAnonymous);
  const isDarkTheme = uiTheme === 'dark';


  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const root = document.documentElement;
    const syncTheme = () => setUiTheme(root.getAttribute('data-theme') || 'dark');
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

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

  const activeProgress = useMemo(() => {
    if (!isMember) return null;
    const sessions = getReadingSessionsForCurrentUser();
    return getProgressCandidate(books, sessions);
  }, [books, isMember]);

  const continueReadingRoute = useMemo(() => {
    const candidate = activeProgress?.book;
    if (!candidate) return '/desk';
    if (candidate?._id || candidate?.id) return `/read/${candidate._id || candidate.id}`;
    if (candidate?.gutenbergId) return `/read/gutenberg/${candidate.gutenbergId}`;
    return '/desk';
  }, [activeProgress]);

  const heroCover = useMemo(() => {
    const fallback = books[0] || null;
    return getBestCoverUrl(activeProgress?.book || fallback);
  }, [activeProgress, books]);

  return (
    <div className="home-page animate-fade-in">
      <div className="layout-shell home-shell">
        <header className="layout-section home-hero" aria-label="Home hero">
          <div className="layout-content home-hero-layout">
            <div className="home-hero-copy">
              <h1 className="home-title font-serif">
                {isDarkTheme ? 'Read deeply. Connect meaningfully.' : "Books don't end. They echo."}
              </h1>
              <p className="home-subtitle">
                {isDarkTheme
                  ? 'Move through every chapter with focus, then step into rich conversations with readers who truly finished the story.'
                  : 'An editorial reading home for thoughtful readers: quiet sessions, shared notes, and conversations that begin after the final page.'}
              </p>
              <div className="home-hero-actions">
                <Link to={isMember ? '/desk' : '/auth'} className="home-btn home-btn-primary">
                  Start reading
                </Link>
                <Link to="/threads" className="home-btn home-btn-secondary">
                  Explore discussions
                </Link>
              </div>
            </div>

            <div className="home-hero-visual" aria-hidden="true">
              <div className="home-hero-visual-offset" />
              <div className="home-hero-visual-card">
                {heroCover ? (
                  <img src={heroCover} alt="" loading="eager" decoding="async" fetchPriority="high" />
                ) : (
                  <div className="home-hero-visual-fallback font-serif">ATLP</div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="layout-content home-sections">
          {!isMember ? (
            <section className="home-continue home-continue-guest" aria-label="Start reading">
              <h2 className="font-serif">Start reading</h2>
              <p>Sign in to track progress, pick up where you left off, and unlock discussion rooms.</p>
              <Link to="/auth" className="home-btn home-btn-primary">Start reading</Link>
            </section>
          ) : null}

          {isMember && activeProgress ? (
            <section className="home-continue" aria-label="Continue reading">
              <div className="home-continue-cover">
                {getBestCoverUrl(activeProgress.book) ? (
                  <img src={getBestCoverUrl(activeProgress.book)} alt="" loading="lazy" decoding="async" />
                ) : (
                  <div className="home-cover-fallback font-serif">Book</div>
                )}
              </div>
              <div className="home-continue-copy">
                <span className="home-continue-kicker">Continue reading</span>
                <h2 className="font-serif">{activeProgress.book?.title || 'Untitled book'}</h2>
                <p>{activeProgress.book?.author || 'Unknown author'}</p>
                <div className="home-continue-progress-meta">
                  <span>{activeProgress.progress}% complete</span>
                  <span>Page {Math.max(1, Number(activeProgress.session?.currentPage || 1))}</span>
                </div>
                <div className="home-progress-track" role="progressbar" aria-label="Reading progress" aria-valuenow={activeProgress.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${activeProgress.progress}%` }} />
                </div>
              </div>
              <Link to={continueReadingRoute} className="home-btn home-btn-secondary">Resume</Link>
            </section>
          ) : null}

          <section className="home-features" aria-label="Features">
            {featureCards.map((feature) => (
              <article
                key={feature.key}
                className={`home-feature-card home-feature-${isDarkTheme ? feature.darkVariant : feature.lightVariant}`}
              >
                <h3 className="font-serif">{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </section>

          <section className="home-cta" aria-label="Closing call to action">
            <h2 className="font-serif">Finish one chapter. Discover ten conversations.</h2>
            <p>Build a reading rhythm that feels personal in light mode and cinematic in dark mode.</p>
            <Link to={isMember ? '/desk' : '/auth'} className="home-btn home-btn-primary">
              {isMember ? 'Open your desk' : 'Start reading'}
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

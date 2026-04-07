import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import { getReadingSessionsForCurrentUser } from '../utils/readingSession';
import HeroSection from '../components/homepage/HeroSection';
import CurrentReadingCard from '../components/homepage/CurrentReadingCard';
import MeetReadersCard from '../components/homepage/MeetReadersCard';
import ThreadsCard from '../components/homepage/ThreadsCard';
import ExperienceCard from '../components/homepage/ExperienceCard';
import EmotionalSection from '../components/homepage/EmotionalSection';
import { cardStagger } from '../components/homepage/motionPresets';
import './LandingPage.css';

const MotionSection = motion.section;

const EXPERIENCE_ITEMS = [
  {
    key: 'immersive',
    title: 'Immersive Reading',
    description: 'Quiet pages, focused flow.',
    tone: 'one',
  },
  {
    key: 'minds',
    title: 'Meet Minds',
    description: 'Readers who reached the end.',
    tone: 'two',
  },
  {
    key: 'threads',
    title: 'Book Threads',
    description: 'Thoughtful, spoiler-safe depth.',
    tone: 'three',
  },
  {
    key: 'merch',
    title: 'AI Merchandise',
    description: 'Artifacts from stories you loved.',
    tone: 'four',
  },
];

const resolveBookId = (book) => String(book?._id || book?.id || book?.gutenbergId || '').trim();

const getSessionForBook = (sessions, book) => {
  if (!book || !sessions || typeof sessions !== 'object') return null;

  const candidates = [
    String(book?._id || ''),
    String(book?.id || ''),
    String(book?.gutenbergId || ''),
  ].filter(Boolean);

  return candidates.map((id) => sessions[id]).find(Boolean) || null;
};

const getCurrentReading = (books, sessions) => books
  .map((book) => {
    const session = getSessionForBook(sessions, book);
    if (!session) return null;
    const progress = Number(session?.progressPercent || 0);
    if (!Number.isFinite(progress) || progress <= 0 || progress >= 100 || session?.isFinished) return null;
    return {
      book,
      session,
      progress: Math.max(1, Math.min(99, progress)),
    };
  })
  .filter(Boolean)
  .sort((a, b) => new Date(b.session?.lastOpenedAt || 0).getTime() - new Date(a.session?.lastOpenedAt || 0).getTime())[0] || null;

const estimateTimeLeft = (session) => {
  if (!session) return 'Time left unavailable';
  const totalPages = Math.max(0, Number(session?.totalPages || 0));
  const currentPage = Math.max(0, Number(session?.currentPage || 0));

  if (totalPages > 0 && currentPage > 0) {
    const pagesLeft = Math.max(0, totalPages - currentPage);
    const mins = Math.max(5, Math.round(pagesLeft * 1.4));
    return mins >= 60
      ? `${Math.floor(mins / 60)}h ${mins % 60}m left`
      : `${mins} min left`;
  }

  const progress = Number(session?.progressPercent || 0);
  if (progress > 0 && progress < 100) {
    const estimatedMins = Math.round((100 - progress) * 1.2);
    return `${Math.max(5, estimatedMins)} min left`;
  }

  return 'Time left unavailable';
};

export default function LandingPage({ currentUser }) {
  const [books, setBooks] = useState([]);
  const [threadPreview, setThreadPreview] = useState(null);
  const [readerNames, setReaderNames] = useState([]);
  const [finishedCount, setFinishedCount] = useState(0);
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const { data } = await api.get('/books');
        if (!cancelled) {
          setBooks(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setBooks([]);
        }
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isMember || books.length === 0) {
      return;
    }

    let cancelled = false;

    const loadThreadData = async () => {
      try {
        const candidateIds = books.map(resolveBookId).filter(Boolean).slice(0, 8);
        if (!candidateIds.length) return;

        const { data: access } = await api.post('/access/check-batch', {
          bookIds: candidateIds,
          context: 'thread',
        });

        const allowedIds = (Array.isArray(access?.allowedBookIds) ? access.allowedBookIds : []).map(String);
        const sampleIds = allowedIds.slice(0, 3);

        let preview = null;
        const authors = new Set();

        for (const id of sampleIds) {
          try {
            const { data } = await api.get(`/threads/${encodeURIComponent(id)}`, { params: { limit: 5 } });
            const items = Array.isArray(data?.items) ? data.items : [];
            items.forEach((item) => {
              if (item?.authorAnonId) authors.add(String(item.authorAnonId));
              (item?.comments || []).slice(0, 3).forEach((comment) => {
                if (comment?.authorAnonId) authors.add(String(comment.authorAnonId));
              });
            });

            if (!preview && items.length > 0) {
              const first = items[0];
              preview = {
                title: first?.title,
                content: String(first?.content || '').slice(0, 120),
              };
            }
          } catch {
            // keep fallback UI for inaccessible thread books
          }
        }

        if (!cancelled) {
          const sampled = Array.from(authors).filter(Boolean);
          setReaderNames(sampled.slice(0, 3));
          setFinishedCount(Math.max(sampled.length, sampleIds.length));
          setThreadPreview(preview);
        }
      } catch {
        if (!cancelled) {
          setReaderNames([]);
          setFinishedCount(0);
          setThreadPreview(null);
        }
      }
    };

    loadThreadData();

    return () => {
      cancelled = true;
    };
  }, [books, isMember]);

  const readingSessions = useMemo(() => (isMember ? getReadingSessionsForCurrentUser() : {}), [isMember]);

  const activeReading = useMemo(() => getCurrentReading(books, readingSessions), [books, readingSessions]);

  const timeLeft = useMemo(() => estimateTimeLeft(activeReading?.session), [activeReading]);
  const todayLabel = useMemo(() => (
    new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())
  ), []);

  return (
    <div className="home2-page animate-fade-in">
      <div className="layout-shell home2-shell">
        <section className="layout-content">
          <HeroSection
            primaryHref={isMember ? '/desk' : '/auth'}
            secondaryHref="/meet"
            primaryLabel={isMember ? 'Start Reading' : 'Start Reading'}
          />

          {isMember ? (
            <section className="home2-desk" aria-label="Your Desk">
              <header className="home2-section-head">
                <h2 className="font-serif">Your Desk</h2>
                <p className="home2-section-date">{todayLabel}</p>
              </header>
              <div className="home2-desk-grid">
                <CurrentReadingCard
                  book={activeReading?.book || null}
                  progress={activeReading?.progress || 0}
                  timeLeft={timeLeft}
                />
                <div className="home2-stack">
                  <MeetReadersCard readers={readerNames} count={finishedCount} />
                  <ThreadsCard preview={threadPreview} />
                </div>
              </div>
            </section>
          ) : null}

          <MotionSection
            className="home2-experience"
            aria-label="Experience"
            variants={cardStagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.28 }}
          >
            {EXPERIENCE_ITEMS.map((item, index) => (
              <ExperienceCard
                key={item.key}
                title={item.title}
                description={item.description}
                tone={item.tone}
                index={index}
              />
            ))}
          </MotionSection>

          <EmotionalSection />
        </section>
      </div>
    </div>
  );
}

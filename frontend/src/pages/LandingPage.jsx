import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, Users } from 'lucide-react';
import './LandingPage.css';

const howItWorksSteps = [
  { key: 'read', title: 'Read in silence', description: 'A quiet reading space designed for focus.', icon: BookOpen },
  { key: 'finish', title: 'Mark the moment', description: 'Finish the book to unlock its discussion room.', icon: Check },
  { key: 'discuss', title: 'Enter the room', description: 'Join conversations with readers who finished it too.', icon: Users },
];

export default function LandingPage({ currentUser }) {
  const [isHowVisible, setIsHowVisible] = useState(false);
  const [isHowAnimReady, setIsHowAnimReady] = useState(false);
  const howItWorksRef = useRef(null);

  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

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
                <Link to={isMember ? '/desk' : '/auth'} className="btn-primary">
                  Start Reading
                </Link>
                <Link to="/threads" className="btn-secondary">Explore discussions</Link>
              </div>

              {!isMember && (
                <p className="home-signin-hint">
                  Rooms unlock per book after a quick 5-question check — <Link to="/auth">sign in</Link> to keep your place across visits.
                </p>
              )}
            </div>
          </div>
        </header>

        <div className="layout-content home-sections">
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
                    <h3 className="font-serif">{step.title}</h3>
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

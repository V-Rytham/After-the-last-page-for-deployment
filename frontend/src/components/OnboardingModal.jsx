import React, { useRef, useState } from 'react';
import OnboardingCard from './OnboardingCard';

const cards = [
  {
    title: 'Stay grounded in the book',
    description: 'Every discussion stays tied to the text.',
  },
  {
    title: 'Structured thinking, not noise',
    description: 'Threads encourage meaningful responses.',
  },
  {
    title: 'Talk live with readers',
    description: 'Join real-time discussions in Meet.',
  },
  {
    title: 'Explore ideas seamlessly',
    description: 'Jump across threads effortlessly.',
  },
];

const ONBOARDING_KEY = 'hasSeenOnboarding';

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return !window.localStorage.getItem(ONBOARDING_KEY);
    } catch {
      return false;
    }
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(null);

  const closeModal = () => {
    window.localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOpen(false);
  };

  const next = () => {
    setCurrentIndex((prev) => {
      if (prev >= cards.length - 1) {
        closeModal();
        return prev;
      }
      return prev + 1;
    });
  };

  const previous = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleTouchStart = (event) => {
    touchStartX.current = event.changedTouches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    const endX = event.changedTouches?.[0]?.clientX;
    if (touchStartX.current == null || typeof endX !== 'number') return;

    const deltaX = endX - touchStartX.current;
    if (deltaX > 50) previous();
    if (deltaX < -50) next();

    touchStartX.current = null;
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          width: '100%',
          maxWidth: '28rem',
          overflow: 'hidden',
          borderRadius: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: `${cards.length * 100}%`,
            transform: `translateX(-${(100 / cards.length) * currentIndex}%)`,
            transition: 'transform 260ms ease',
          }}
        >
          {cards.map((card, index) => (
            <div key={card.title} style={{ width: `${100 / cards.length}%`, flexShrink: 0 }}>
              <OnboardingCard
                card={card}
                currentIndex={currentIndex}
                total={cards.length}
                onSkip={closeModal}
                onNext={next}
                isActive={index === currentIndex}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

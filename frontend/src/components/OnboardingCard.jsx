import React from 'react';

export default function OnboardingCard({ card, currentIndex, total, onSkip, onNext }) {
  const isLast = currentIndex === total - 1;

  return (
    <div
      style={{
        width: '100%',
        borderRadius: '1rem',
        background: 'var(--surface-1)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.18)',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '1.5rem',
            lineHeight: 1.25,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {card.title}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '0.95rem',
            lineHeight: 1.45,
            color: 'var(--text-secondary)',
          }}
        >
          {card.description}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {Array.from({ length: total }).map((_, index) => (
          <span
            key={`dot-${index}`}
            aria-hidden="true"
            style={{
              width: '0.5rem',
              height: '0.5rem',
              borderRadius: '999px',
              background: index === currentIndex
                ? 'var(--text-primary)'
                : 'color-mix(in srgb, var(--text-primary) 25%, transparent)',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onSkip}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '0.95rem',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          Skip
        </button>

        <button
          type="button"
          onClick={onNext}
          style={{
            border: 'none',
            borderRadius: '999px',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 600,
            minHeight: '2.5rem',
            padding: '0 1rem',
            cursor: 'pointer',
          }}
        >
          {isLast ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  );
}

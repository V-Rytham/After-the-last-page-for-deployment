import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Search, BookX } from 'lucide-react';
import './UnavailableBookState.css';

export default function UnavailableBookState({
  title,
  author,
  sourceUrl,
  sourceLabel,
  hint,
  onExternalClick,
}) {
  const navigate = useNavigate();

  const safeTitle = String(title || '').trim() || 'This book';
  const safeAuthor = String(author || '').trim();
  const safeSourceUrl = String(sourceUrl || '').trim();
  const safeSourceLabel = String(sourceLabel || '').trim();
  const safeHint = String(hint || '').trim();

  const secondaryLine = useMemo(() => {
    if (safeAuthor) return `by ${safeAuthor}`;
    return '';
  }, [safeAuthor]);

  return (
    <main className="unavailable-book-page content-container animate-fade-in">
      <section className="unavailable-book-card glass-panel" aria-label="Book unavailable">
        <div className="unavailable-book-illustration" aria-hidden="true">
          <div className="unavailable-book-icon">
            <BookX size={26} />
          </div>
        </div>

        <div className="unavailable-book-copy">
          <h1 className="font-serif unavailable-book-title">We canâ€™t show this book inside the reader.</h1>
          <p className="unavailable-book-subtitle">
            We found <strong>{safeTitle}</strong>{secondaryLine ? ` ${secondaryLine}` : ''}, but the source only allows lending/preview on their site.
          </p>
          <p className="unavailable-book-note">
            Availability depends on the source{safeSourceLabel ? ` (${safeSourceLabel})` : ''}.
          </p>
          {safeHint ? (
            <p className="unavailable-book-hint">{safeHint}</p>
          ) : null}
        </div>

        <div className="unavailable-book-actions" role="group" aria-label="Next steps">
          {safeSourceUrl ? (
            <a
              className="btn-primary unavailable-book-primary"
              href={safeSourceUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                try {
                  onExternalClick?.(safeSourceUrl);
                } catch {
                  // ignore
                }
              }}
            >
              Preview or borrow on source <ExternalLink size={16} />
            </a>
          ) : null}

          <button
            type="button"
            className="btn-secondary unavailable-book-secondary"
            onClick={() => {
              try {
                const seed = safeTitle !== 'This book' ? safeTitle : (safeAuthor || '');
                if (seed) window.sessionStorage.setItem('atlp-desk-search-prefill', seed);
              } catch {
                // ignore
              }
              navigate('/desk');
            }}
          >
            Search similar books <Search size={16} />
          </button>

          <button
            type="button"
            className="btn-secondary unavailable-book-secondary"
            onClick={() => {
              try {
                navigate(-1);
              } catch {
                navigate('/desk');
              }
            }}
          >
            Go back <ArrowLeft size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}

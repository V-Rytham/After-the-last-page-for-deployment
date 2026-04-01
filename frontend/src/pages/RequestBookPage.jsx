import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Search } from 'lucide-react';
import './RequestBookPage.css';

const RequestBookPage = () => {
  const navigate = useNavigate();
  const [gutenbergId, setGutenbergId] = useState('');

  const normalizedId = useMemo(() => {
    const trimmed = String(gutenbergId || '').trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }, [gutenbergId]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!normalizedId) return;
    navigate(`/read/gutenberg/${normalizedId}`);
  };

  return (
    <div className="request-book-page">
      <section className="request-book-shell">
        <header className="request-book-header">
          <p className="request-book-kicker">Gutenberg Reader</p>
          <h1 className="font-serif">Open a Gutenberg book by ID</h1>
          <p>Enter a Project Gutenberg ID to fetch and read it instantly.</p>
        </header>

        <form className="request-book-form" onSubmit={handleSubmit}>
          <label htmlFor="gutenbergId" className="request-book-label">Gutenberg ID</label>
          <div className="request-book-input-row">
            <input
              id="gutenbergId"
              type="number"
              min="1"
              inputMode="numeric"
              value={gutenbergId}
              onChange={(event) => setGutenbergId(event.target.value)}
              placeholder="e.g. 1342"
            />
            <button className="btn-primary" type="submit" disabled={!normalizedId}>
              <Search size={16} />
              Open
            </button>
          </div>
        </form>

        {!normalizedId && gutenbergId ? (
          <div className="request-book-feedback error">
            <AlertCircle size={16} />
            <span>Please enter a valid Gutenberg ID.</span>
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default RequestBookPage;

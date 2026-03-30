import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, LoaderCircle, Search } from 'lucide-react';
import api from '../utils/api';
import './RequestBookPage.css';

const RequestBookPage = () => {
  const [gutenbergId, setGutenbergId] = useState('');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const normalizedId = useMemo(() => {
    const parsed = Number.parseInt(String(gutenbergId || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }, [gutenbergId]);

  const handlePreview = async (event) => {
    event.preventDefault();
    if (!normalizedId) {
      setError('Please enter a valid Gutenberg ID.');
      setPreview(null);
      return;
    }

    setLoadingPreview(true);
    setError('');
    setResult(null);

    try {
      const { data } = await api.get(`/books/preview/${normalizedId}`);
      setPreview(data);
    } catch (requestError) {
      setPreview(null);
      setError(requestError?.uiMessage || 'Could not fetch preview for that Gutenberg ID.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRequest = async () => {
    if (!normalizedId) {
      setError('Please enter a valid Gutenberg ID.');
      return;
    }

    setRequesting(true);
    setError('');
    setResult(null);

    try {
      const { data } = await api.post('/books/request', { gutenbergId: normalizedId });
      setResult(data);
    } catch (requestError) {
      setError(requestError?.uiMessage || 'Failed to submit request.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="request-book-page">
      <section className="request-book-shell">
        <header className="request-book-header">
          <p className="request-book-kicker">Gutenberg Request</p>
          <h1 className="font-serif">Didn&apos;t find your book?</h1>
          <p>Enter a Project Gutenberg ID, preview it, and request ingestion into the persistent library.</p>
        </header>

        <form className="request-book-form" onSubmit={handlePreview}>
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
            <button className="btn-primary" type="submit" disabled={loadingPreview}>
              {loadingPreview ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}
              Preview
            </button>
          </div>
        </form>

        {error ? (
          <div className="request-book-feedback error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        {preview ? (
          <article className="request-book-preview">
            {preview.cover ? <img src={preview.cover} alt={preview.title} /> : <div className="request-book-cover-fallback" />}
            <div className="request-book-preview-copy">
              <h2 className="font-serif">{preview.title}</h2>
              <p>{preview.author}</p>
              <p className="request-book-preview-meta">Gutenberg ID: {preview.gutenbergId}</p>
              <button className="btn-primary" type="button" onClick={handleRequest} disabled={requesting}>
                {requesting ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}
                Confirm request
              </button>
            </div>
          </article>
        ) : null}

        {result ? (
          <div className="request-book-feedback success">
            <CheckCircle2 size={16} />
            <span>{result.message}</span>
          </div>
        ) : null}

        <footer className="request-book-footer">
          <Link to="/desk">Back to library</Link>
        </footer>
      </section>
    </div>
  );
};

export default RequestBookPage;

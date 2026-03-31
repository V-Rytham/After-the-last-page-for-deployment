import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, LoaderCircle, Search } from 'lucide-react';
import api from '../utils/api';
import './RequestBookPage.css';

const RequestBookPage = () => {
  const [gutenbergId, setGutenbergId] = useState('');
  const [debouncedGutenbergId, setDebouncedGutenbergId] = useState('');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [warmupPending, setWarmupPending] = useState(true);
  const requestSequenceRef = useRef(0);
  const previewAbortRef = useRef(null);
  const requestAbortRef = useRef(null);
  const inFlightRef = useRef(new Map());
  const previewDebounceTimerRef = useRef(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedGutenbergId(gutenbergId);
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [gutenbergId]);

  const debouncedNormalizedId = useMemo(() => {
    const parsed = Number.parseInt(String(debouncedGutenbergId || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }, [debouncedGutenbergId]);

  useEffect(() => () => {
    if (previewDebounceTimerRef.current) {
      window.clearTimeout(previewDebounceTimerRef.current);
    }
    previewAbortRef.current?.abort();
    requestAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    let active = true;

    api.get('/warmup')
      .catch(() => null)
      .finally(() => {
        if (active) {
          setWarmupPending(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const normalizedId = useMemo(() => {
    const parsed = Number.parseInt(String(gutenbergId || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }, [gutenbergId]);

  const getRequestMetadata = useCallback((actionName, targetId) => {
    requestSequenceRef.current += 1;
    const actionId = `${actionName}:${targetId}:${Date.now()}:${requestSequenceRef.current}`;
    return {
      actionId,
      timestamp: new Date().toISOString(),
      headers: {
        'X-Book-Action-Id': actionId,
        'X-Book-Action-Name': actionName,
      },
    };
  }, []);

  const wait = (ms) => new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

  const requestWithRetry = useCallback(async (requestFactory) => {
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await requestFactory(attempt);
      } catch (requestError) {
        const status = Number(requestError?.statusCode || 0);
        const networkFailure = !status;
        const isRetryableServerError = status >= 500 && status < 600;
        const shouldRetry = attempt < maxRetries && (networkFailure || isRetryableServerError);

        if (!shouldRetry || status === 403) {
          throw requestError;
        }

        const backoffMs = 250 * (2 ** attempt);
        await wait(backoffMs);
      }
    }

    return null;
  }, []);

  const runDedupedRequest = useCallback((key, factory) => {
    if (inFlightRef.current.has(key)) {
      return inFlightRef.current.get(key);
    }

    const requestPromise = factory()
      .finally(() => {
        inFlightRef.current.delete(key);
      });

    inFlightRef.current.set(key, requestPromise);
    return requestPromise;
  }, []);

  const executePreviewRequest = useCallback(async (targetId) => {
    const dedupeKey = `preview:${targetId}`;

    return runDedupedRequest(dedupeKey, async () => {
      previewAbortRef.current?.abort();
      const controller = new AbortController();
      previewAbortRef.current = controller;

      setLoadingPreview(true);
      setError('');
      setResult(null);

      const metadata = getRequestMetadata('preview', targetId);
      console.info('[FIND_BOOK] preview_requested', metadata);

      try {
        const response = await requestWithRetry(() => api.get(`/books/preview/${targetId}`, {
          signal: controller.signal,
          headers: metadata.headers,
        }));

        if (response?.data?.status === 'loading') {
          await wait((Number(response.data.retryAfter || 2) || 2) * 1000);
          const followup = await api.get(`/books/preview/${targetId}`, {
            signal: controller.signal,
            headers: metadata.headers,
          });
          setPreview(followup.data);
          return;
        }

        setPreview(response.data);
      } catch (requestError) {
        if (requestError?.name === 'CanceledError' || requestError?.code === 'ERR_CANCELED') {
          return;
        }

        setPreview(null);
        setError(requestError?.uiMessage || 'Could not fetch preview for that Gutenberg ID.');
      } finally {
        if (previewAbortRef.current === controller) {
          previewAbortRef.current = null;
        }
        setLoadingPreview(false);
      }
    });
  }, [getRequestMetadata, requestWithRetry, runDedupedRequest]);

  const handlePreview = async (event) => {
    event.preventDefault();
    if (!normalizedId) {
      setError('Please enter a valid Gutenberg ID.');
      setPreview(null);
      return;
    }

    if (previewDebounceTimerRef.current) {
      window.clearTimeout(previewDebounceTimerRef.current);
    }

    previewDebounceTimerRef.current = window.setTimeout(() => {
      executePreviewRequest(debouncedNormalizedId || normalizedId);
    }, 400);
  };

  const handleRequest = async () => {
    if (!normalizedId) {
      setError('Please enter a valid Gutenberg ID.');
      return;
    }

    const dedupeKey = `request:${normalizedId}`;
    await runDedupedRequest(dedupeKey, async () => {
      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;

      setRequesting(true);
      setError('');
      setResult(null);

      const metadata = getRequestMetadata('ingestion_request', normalizedId);
      console.info('[FIND_BOOK] request_submitted', metadata);

      try {
        const response = await requestWithRetry(() => api.post(
          '/books/request',
          { gutenbergId: normalizedId },
          {
            signal: controller.signal,
            headers: metadata.headers,
          },
        ));

        if (response?.data?.status === 'loading') {
          setResult({ message: 'Server warming up. Please try again in a moment.' });
          return;
        }

        setResult(response.data);
      } catch (requestError) {
        if (requestError?.name === 'CanceledError' || requestError?.code === 'ERR_CANCELED') {
          return;
        }

        setError(requestError?.uiMessage || 'Failed to submit request.');
      } finally {
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
        setRequesting(false);
      }
    });
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
            <button className="btn-primary" type="submit" disabled={loadingPreview || requesting || warmupPending}>
              {loadingPreview ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}
              Preview
            </button>
          </div>
        </form>


        {warmupPending ? (
          <div className="request-book-feedback">
            <LoaderCircle size={16} className="spin" />
            <span>Warming up the service…</span>
          </div>
        ) : null}

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
              <button className="btn-primary" type="button" onClick={handleRequest} disabled={requesting || loadingPreview || warmupPending}>
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

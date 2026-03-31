import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [warmupPending, setWarmupPending] = useState(true);
  const requestSequenceRef = useRef(0);
  const previewAbortRef = useRef(null);
  const requestAbortRef = useRef(null);
  const inFlightRef = useRef(new Map());
  const previewDebounceTimerRef = useRef(null);
  const previewRequestIdRef = useRef(0);
  const ingestionRequestIdRef = useRef(0);

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
    if (typeof gutenbergId === 'number') {
      if (!Number.isSafeInteger(gutenbergId) || gutenbergId <= 0) {
        return null;
      }

      return gutenbergId;
    }

    if (typeof gutenbergId !== 'string' || !gutenbergId || gutenbergId.trim() !== gutenbergId || !/^\d+$/.test(gutenbergId)) {
      return null;
    }

    const parsed = Number(gutenbergId);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }, [gutenbergId]);

  const inputValidationError = useMemo(() => {
    if (gutenbergId === '') {
      return '';
    }

    return normalizedId ? '' : 'Please enter a valid Gutenberg ID.';
  }, [gutenbergId, normalizedId]);

  useEffect(() => {
    setPreview(null);
    setResult(null);
    setError('');

    if (previewDebounceTimerRef.current) {
      window.clearTimeout(previewDebounceTimerRef.current);
      previewDebounceTimerRef.current = null;
    }

    previewAbortRef.current?.abort();
    requestAbortRef.current?.abort();
    setLoadingPreview(false);
    setRequesting(false);
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

  const getRetryAfterMs = useCallback((error, fallbackSeconds = 1) => {
    const headerRetryAfter = Number(error?.response?.headers?.['retry-after'] || 0);
    const bodyRetryAfter = Number(error?.response?.data?.retryAfter || 0);
    const resolvedSeconds = headerRetryAfter > 0 ? headerRetryAfter : (bodyRetryAfter > 0 ? bodyRetryAfter : fallbackSeconds);
    return resolvedSeconds * 1000;
  }, []);

  const normalizeUiError = useCallback((requestError, fallbackMessage) => {
    const status = Number(requestError?.statusCode || requestError?.response?.status || 0);
    const code = String(requestError?.response?.data?.code || '').trim().toUpperCase();
    if (code === 'INVALID_GUTENBERG_ID') return 'Please enter a valid Gutenberg ID.';
    if (code === 'BOOK_NOT_FOUND') return 'Book not found for that Gutenberg ID.';
    if (code === 'RATE_LIMITED' || status === 429) return 'Rate limited. Please wait and retry.';
    if (status >= 500) return 'Server error. Please try again shortly.';
    return fallbackMessage;
  }, []);

  const requestWithRetry = useCallback(async (requestFactory, { action, gutenbergId }) => {
    const maxRetries = 2;
    let retryableErrorAttempts = 0;
    let loadingRetryUsed = false;
    let rateLimitRetryUsed = false;

    while (true) {
      try {
        const response = await requestFactory(retryableErrorAttempts);

        if (response?.data?.status === 'loading') {
          if (loadingRetryUsed) {
            return response;
          }

          loadingRetryUsed = true;
          console.info('[FIND_BOOK]', {
            action,
            gutenbergId,
            outcome: 'loading_retry_scheduled',
            retryAfter: Number(response?.data?.retryAfter || 1) || 1,
          });
          await wait((Number(response?.data?.retryAfter || 1) || 1) * 1000);
          continue;
        }

        return response;
      } catch (requestError) {
        const status = Number(requestError?.statusCode || 0);
        const isLoading503 = status === 503 && requestError?.response?.data?.status === 'loading';
        const isRateLimited = status === 429;
        const networkFailure = !status;
        const isRetryableServerError = status >= 500 && status < 600 && status !== 503;
        const shouldRetryForFailure = retryableErrorAttempts < maxRetries && (networkFailure || isRetryableServerError);

        if (isLoading503) {
          if (loadingRetryUsed) {
            throw requestError;
          }

          loadingRetryUsed = true;
          console.info('[FIND_BOOK]', {
            action,
            gutenbergId,
            outcome: '503_loading_retry_scheduled',
            retryAfterMs: getRetryAfterMs(requestError, 1),
          });
          await wait(getRetryAfterMs(requestError, 1));
          continue;
        }

        if (isRateLimited) {
          if (rateLimitRetryUsed) {
            throw requestError;
          }

          rateLimitRetryUsed = true;
          console.info('[FIND_BOOK]', {
            action,
            gutenbergId,
            outcome: '429_retry_scheduled',
            retryAfterMs: getRetryAfterMs(requestError, 1),
          });
          await wait(getRetryAfterMs(requestError, 1));
          continue;
        }

        if (!shouldRetryForFailure || status === 400 || status === 403 || status === 404) {
          throw requestError;
        }

        const backoffMs = 250 * (2 ** retryableErrorAttempts);
        console.info('[FIND_BOOK]', {
          action,
          gutenbergId,
          outcome: 'retryable_error_backoff',
          attempt: retryableErrorAttempts + 1,
          backoffMs,
          status,
        });
        retryableErrorAttempts += 1;
        await wait(backoffMs);
      }
    }
  }, [getRetryAfterMs]);

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
      previewRequestIdRef.current += 1;
      const requestId = previewRequestIdRef.current;

      setLoadingPreview(true);
      setError('');
      setResult(null);
      setPreview(null);

      const metadata = getRequestMetadata('preview', targetId);
      console.info('[FIND_BOOK]', { ...metadata, action: 'preview', gutenbergId: targetId, outcome: 'requested' });

      try {
        const response = await requestWithRetry(() => api.get(`/books/preview/${targetId}`, {
          signal: controller.signal,
          headers: metadata.headers,
        }), { action: 'preview', gutenbergId: targetId });

        if (previewRequestIdRef.current !== requestId) {
          return;
        }

        if (response?.data?.status === 'loading') {
          setError('Preview service is still warming up. Please try again in a moment.');
          console.info('[FIND_BOOK]', { ...metadata, action: 'preview', gutenbergId: targetId, outcome: 'loading' });
          return;
        }

        setPreview(response.data);
        setError('');
        console.info('[FIND_BOOK]', { ...metadata, action: 'preview', gutenbergId: targetId, outcome: 'success' });
      } catch (requestError) {
        if (requestError?.name === 'CanceledError' || requestError?.code === 'ERR_CANCELED') {
          console.info('[FIND_BOOK]', { ...metadata, action: 'preview', gutenbergId: targetId, outcome: 'aborted' });
          return;
        }

        if (previewRequestIdRef.current !== requestId) {
          return;
        }

        setPreview(null);
        setError(normalizeUiError(requestError, 'Could not fetch preview for that Gutenberg ID.'));
        console.error('[FIND_BOOK]', {
          ...metadata,
          action: 'preview',
          gutenbergId: targetId,
          outcome: 'error',
          statusCode: requestError?.statusCode || null,
          code: requestError?.response?.data?.code || null,
        });
      } finally {
        if (previewAbortRef.current === controller && previewRequestIdRef.current === requestId) {
          previewAbortRef.current = null;
          setLoadingPreview(false);
        }
      }
    });
  }, [getRequestMetadata, normalizeUiError, requestWithRetry, runDedupedRequest]);

  const handlePreview = async (event) => {
    event.preventDefault();
    if (!normalizedId) {
      setError(inputValidationError || 'Please enter a valid Gutenberg ID.');
      setPreview(null);
      return;
    }

    if (previewDebounceTimerRef.current) {
      window.clearTimeout(previewDebounceTimerRef.current);
    }

    previewDebounceTimerRef.current = window.setTimeout(() => {
      executePreviewRequest(normalizedId);
    }, 400);
  };

  const handleRequest = useCallback(async () => {
    if (!normalizedId) {
      setError(inputValidationError || 'Please enter a valid Gutenberg ID.');
      return;
    }

    const dedupeKey = `request:${normalizedId}`;
    await runDedupedRequest(dedupeKey, async () => {
      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;
      ingestionRequestIdRef.current += 1;
      const requestId = ingestionRequestIdRef.current;

      setRequesting(true);
      setError('');
      setResult(null);

      const metadata = getRequestMetadata('ingestion_request', normalizedId);
      console.info('[FIND_BOOK]', { ...metadata, action: 'ingestion_request', gutenbergId: normalizedId, outcome: 'requested' });

      try {
        const response = await requestWithRetry(() => api.post(
          '/books/request',
          { gutenbergId: normalizedId },
          {
            signal: controller.signal,
            headers: metadata.headers,
          },
        ), { action: 'ingestion_request', gutenbergId: normalizedId });

        if (ingestionRequestIdRef.current !== requestId) {
          return;
        }

        setResult(response?.data?.status === 'loading'
          ? { message: 'Server warming up. Please try again in a moment.' }
          : response.data);
        setError('');
        console.info('[FIND_BOOK]', {
          ...metadata,
          action: 'ingestion_request',
          gutenbergId: normalizedId,
          outcome: response?.data?.status || 'success',
        });
      } catch (requestError) {
        if (requestError?.name === 'CanceledError' || requestError?.code === 'ERR_CANCELED') {
          console.info('[FIND_BOOK]', { ...metadata, action: 'ingestion_request', gutenbergId: normalizedId, outcome: 'aborted' });
          return;
        }

        if (ingestionRequestIdRef.current !== requestId) {
          return;
        }

        setError(normalizeUiError(requestError, 'Failed to submit request.'));
        console.error('[FIND_BOOK]', {
          ...metadata,
          action: 'ingestion_request',
          gutenbergId: normalizedId,
          outcome: 'error',
          statusCode: requestError?.statusCode || null,
          code: requestError?.response?.data?.code || null,
        });
      } finally {
        if (requestAbortRef.current === controller && ingestionRequestIdRef.current === requestId) {
          requestAbortRef.current = null;
          setRequesting(false);
        }
      }
    });
  }, [getRequestMetadata, inputValidationError, normalizedId, normalizeUiError, requestWithRetry, runDedupedRequest]);

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

        {(inputValidationError || error) ? (
          <div className="request-book-feedback error">
            <AlertCircle size={16} />
            <span>{inputValidationError || error}</span>
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

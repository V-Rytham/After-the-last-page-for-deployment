import { Book } from '../models/Book.js';

const DEFAULT_QUESTION_ENGINE_URL = 'https://deterministic-question-engine-3sd2.onrender.com';

const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const getEngineUrl = () => normalizeUrl(process.env.QUIZ_QUESTION_ENGINE_URL) || DEFAULT_QUESTION_ENGINE_URL;

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const normalizeText = (value) => String(value || '').trim();

const normalizeCompare = (value) => normalizeText(value).toLowerCase();

const normalizeLooseCompare = (value) => normalizeCompare(value).replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

const resolveGutenbergId = async (bookId) => {
  const book = await Book.findById(bookId).select('gutenbergId');
  if (!book) {
    const error = new Error('Book not found.');
    error.statusCode = 404;
    throw error;
  }

  const gutenbergId = Number(book.gutenbergId);
  if (!Number.isInteger(gutenbergId) || gutenbergId <= 0) {
    const error = new Error('Quiz is not available for this book yet.');
    error.statusCode = 400;
    throw error;
  }

  return gutenbergId;
};

const fetchWithTimeout = async (url, { timeoutMs, options }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await safeJson(response);
    return { response, payload };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Question engine request timed out.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const getMcqs = async (gutenbergId, { limit = 5, timeoutMs }) => {
  const url = new URL(`${getEngineUrl()}/mcqs/${encodeURIComponent(gutenbergId)}`);
  url.searchParams.set('limit', String(limit));

  const { response, payload } = await fetchWithTimeout(url.toString(), {
    timeoutMs,
    options: { method: 'GET', headers: { Accept: 'application/json' } },
  });

  if (!response.ok) {
    const message = payload?.message || payload?.detail || `Question engine request failed (${response.status}).`;
    const error = new Error(typeof message === 'string' ? message : `Question engine request failed (${response.status}).`);
    error.statusCode = response.status;
    throw error;
  }

  const mcqs = Array.isArray(payload?.mcqs) ? payload.mcqs : (Array.isArray(payload?.data?.mcqs) ? payload.data.mcqs : []);
  return mcqs;
};

const startGeneration = async (gutenbergId, { timeoutMs }) => {
  const url = `${getEngineUrl()}/generate`;
  const { response, payload } = await fetchWithTimeout(url, {
    timeoutMs,
    options: {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: gutenbergId }),
    },
  });

  if (response.status === 202 || response.ok) {
    return payload || { status: 'processing' };
  }

  const message = payload?.message || payload?.detail || `Question engine generate failed (${response.status}).`;
  const error = new Error(typeof message === 'string' ? message : `Question engine generate failed (${response.status}).`);
  error.statusCode = response.status;
  throw error;
};

const checkStatus = async (gutenbergId, { timeoutMs }) => {
  const url = `${getEngineUrl()}/status/${encodeURIComponent(gutenbergId)}`;
  const { response, payload } = await fetchWithTimeout(url, {
    timeoutMs,
    options: { method: 'GET', headers: { Accept: 'application/json' } },
  });

  if (!response.ok) {
    return null;
  }

  return payload;
};

const normalizeMcqs = (mcqs) => {
  const slice = mcqs.slice(0, 5).map((mcq) => {
    const question = normalizeText(mcq?.question);
    const options = Array.isArray(mcq?.options) ? mcq.options.map((opt) => normalizeText(opt)) : [];
    const correctAnswer = normalizeText(mcq?.correct_answer);

    const correctIndexExact = options.findIndex((opt) => normalizeCompare(opt) === normalizeCompare(correctAnswer));
    const correctIndexLoose = correctIndexExact !== -1
      ? correctIndexExact
      : options.findIndex((opt) => normalizeLooseCompare(opt) === normalizeLooseCompare(correctAnswer));

    return {
      question,
      options,
      correctIndex: correctIndexLoose === -1 ? null : correctIndexLoose,
    };
  });

  for (const item of slice) {
    if (!item.question || item.options.length < 2 || item.correctIndex == null) {
      const error = new Error('Question engine returned malformed questions.');
      error.statusCode = 502;
      throw error;
    }
  }

  return slice;
};

export const fetchBookQuizQuestions = async (
  bookId,
  {
    timeoutMs = 45000,
    pollIntervalMs = 2000,
    maxPollMs = 45000,
  } = {},
) => {
  const normalizedBookId = String(bookId || '').trim();
  if (!normalizedBookId) {
    const error = new Error('bookId is required');
    error.statusCode = 400;
    throw error;
  }

  const gutenbergId = await resolveGutenbergId(normalizedBookId);

  const startAt = Date.now();
  let generationTriggered = false;

  while (Date.now() - startAt < maxPollMs) {
    let mcqs = [];
    try {
      mcqs = await getMcqs(gutenbergId, { limit: 5, timeoutMs: Math.min(timeoutMs, 12000) });
    } catch (error) {
      if (error?.statusCode === 404 && !generationTriggered) {
        // Not generated yet, trigger generation below.
      } else {
        throw error;
      }
    }

    if (Array.isArray(mcqs) && mcqs.length >= 5) {
      return normalizeMcqs(mcqs);
    }

    const statusPayload = await checkStatus(gutenbergId, { timeoutMs: Math.min(timeoutMs, 8000) });
    const lastError = statusPayload?.book?.last_error || statusPayload?.last_error;
    const status = String(statusPayload?.book?.status || statusPayload?.status || '').toLowerCase();

    if (lastError) {
      const error = new Error(String(lastError));
      error.statusCode = 502;
      throw error;
    }

    if (status === 'failed' || status === 'error') {
      const error = new Error('Quiz generation failed.');
      error.statusCode = 502;
      throw error;
    }

    if (!generationTriggered) {
      if (status === 'processing' || status === 'complete' || status === 'completed' || status === 'ready') {
        generationTriggered = true;
      } else {
        generationTriggered = true;
        await startGeneration(gutenbergId, { timeoutMs: Math.min(timeoutMs, 15000) });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const processingError = new Error('Quiz generation is taking longer than expected.');
  processingError.statusCode = 202;
  processingError.code = 'PROCESSING';
  throw processingError;
};

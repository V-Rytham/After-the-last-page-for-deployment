import { Book } from '../models/Book.js';

const parsePositiveIntStrict = (value) => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  if (!value || value.trim() !== value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const DEFAULT_QUESTION_ENGINE_URL = 'https://deterministic-question-engine-3sd2.onrender.com';
const LEGACY_QUESTION_ENGINE_URL = 'https://deterministic-question-engine-1.onrender.com';
const GENERATED_REQUEST_TTL_MS = 30 * 60 * 1000;

const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const getCandidateEngineUrls = () => {
  const configured = normalizeUrl(process.env.QUIZ_QUESTION_ENGINE_URL);
  const fallbackEnv = String(process.env.QUIZ_QUESTION_ENGINE_FALLBACK_URLS || '')
    .split(',')
    .map((value) => normalizeUrl(value))
    .filter(Boolean);

  const urls = [
    configured,
    ...fallbackEnv,
    DEFAULT_QUESTION_ENGINE_URL,
    LEGACY_QUESTION_ENGINE_URL,
  ].filter(Boolean);

  return [...new Set(urls)];
};

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const extractErrorMessage = (payload, fallbackMessage) => {
  const detail = payload?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  if (Array.isArray(detail) && detail.length) {
    const joined = detail.map((item) => (typeof item?.msg === 'string' ? item.msg : String(item))).join('; ').trim();
    if (joined) return joined;
  }
  return fallbackMessage;
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

  const gutenbergId = parsePositiveIntStrict(book.gutenbergId);
  if (!gutenbergId) {
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

const requestEngine = async ({ path, timeoutMs, options, acceptedStatuses = [200], tolerateNotFound = false }) => {
  const candidateUrls = getCandidateEngineUrls();
  let lastError = null;

  for (const baseUrl of candidateUrls) {
    const requestUrl = `${baseUrl}${path}`;
    try {
      const { response, payload } = await fetchWithTimeout(requestUrl, { timeoutMs, options });
      if (acceptedStatuses.includes(response.status)) {
        return { payload, response, baseUrl };
      }

      const message = extractErrorMessage(payload, `Question engine request failed (${response.status}).`);
      if (tolerateNotFound && response.status === 404) {
        lastError = Object.assign(new Error(message), { statusCode: response.status });
        console.warn(`[QUIZ_ENGINE] ${requestUrl} -> ${response.status}: ${message}`);
        continue;
      }

      console.error(`[QUIZ_ENGINE] ${requestUrl} -> ${response.status}: ${message}`);
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    } catch (error) {
      if (error?.statusCode === 404 && tolerateNotFound) {
        lastError = error;
        continue;
      }
      lastError = error;
      if (error?.name === 'AbortError' || error?.statusCode === 504) {
        console.warn(`[QUIZ_ENGINE] ${requestUrl} timed out.`);
      }
    }
  }

  throw lastError || Object.assign(new Error('Question engine is unavailable.'), { statusCode: 502 });
};

const getMcqs = async (gutenbergId, { limit = 5, timeoutMs }) => {
  const path = `/mcqs/${encodeURIComponent(gutenbergId)}?limit=${encodeURIComponent(String(limit))}`;
  const { payload } = await requestEngine({
    path,
    timeoutMs,
    options: { method: 'GET', headers: { Accept: 'application/json' } },
    acceptedStatuses: [200],
    tolerateNotFound: true,
  });

  const mcqs = Array.isArray(payload?.mcqs) ? payload.mcqs : (Array.isArray(payload?.data?.mcqs) ? payload.data.mcqs : []);
  return mcqs;
};

const startGeneration = async (gutenbergId, { timeoutMs }) => {
  const { payload, response } = await requestEngine({
    path: '/generate',
    timeoutMs,
    options: {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: gutenbergId }),
    },
    acceptedStatuses: [200, 202],
  });

  return {
    payload: payload || { status: 'processing' },
    statusCode: Number(response?.status || 0),
  };
};

const checkStatus = async (gutenbergId, { timeoutMs }) => {
  try {
    const { payload } = await requestEngine({
      path: `/status/${encodeURIComponent(gutenbergId)}`,
      timeoutMs,
      options: { method: 'GET', headers: { Accept: 'application/json' } },
      acceptedStatuses: [200],
      tolerateNotFound: true,
    });
    return payload;
  } catch (error) {
    if (error?.statusCode === 404) {
      return null;
    }
    throw error;
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getBackoffMs = (attemptIndex, { baseMs = 5000, stepMs = 5000, maxMs = 15000 } = {}) => {
  const safeAttempt = Number.isInteger(attemptIndex) && attemptIndex >= 0 ? attemptIndex : 0;
  return Math.min(baseMs + (safeAttempt * stepMs), maxMs);
};

const generationLocks = new Map();

const withBookGenerationLock = async (gutenbergId, fn) => {
  const key = String(gutenbergId);
  const existing = generationLocks.get(key);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    try {
      return await fn();
    } finally {
      generationLocks.delete(key);
    }
  })();

  generationLocks.set(key, pending);
  return pending;
};

const generationTriggerCache = new Map();

const hasFreshGenerationTrigger = (gutenbergId) => {
  const key = String(gutenbergId);
  const triggeredAt = Number(generationTriggerCache.get(key) || 0);
  if (!triggeredAt) return false;
  const fresh = Date.now() - triggeredAt < GENERATED_REQUEST_TTL_MS;
  if (!fresh) generationTriggerCache.delete(key);
  return fresh;
};

const markGenerationTriggered = (gutenbergId) => {
  generationTriggerCache.set(String(gutenbergId), Date.now());
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
    maxPollRetries = 12,
    initialPollDelayMs = 5000,
    pollBackoffStepMs = 5000,
    maxPollDelayMs = 15000,
  } = {},
) => {
  const normalizedBookId = String(bookId || '').trim();
  if (!normalizedBookId) {
    const error = new Error('bookId is required');
    error.statusCode = 400;
    throw error;
  }

  const gutenbergId = await resolveGutenbergId(normalizedBookId);

  let generationImmediateMcqs = [];
  let generationResponseStatusCode = 0;
  if (!hasFreshGenerationTrigger(gutenbergId)) {
    const generationResult = await withBookGenerationLock(gutenbergId, async () => {
      if (hasFreshGenerationTrigger(gutenbergId)) return;

      const generationResponse = await startGeneration(gutenbergId, { timeoutMs: Math.min(timeoutMs, 15000) });
      markGenerationTriggered(gutenbergId);

      const immediateMcqs = Array.isArray(generationResponse?.payload?.mcqs)
        ? generationResponse.payload.mcqs
        : (Array.isArray(generationResponse?.payload?.data?.mcqs) ? generationResponse.payload.data.mcqs : []);
      if (immediateMcqs.length >= 5) {
        generationTriggerCache.delete(String(gutenbergId));
      }
      return {
        mcqs: immediateMcqs,
        statusCode: generationResponse?.statusCode || 0,
      };
    });

    generationImmediateMcqs = Array.isArray(generationResult?.mcqs) ? generationResult.mcqs : [];
    generationResponseStatusCode = Number(generationResult?.statusCode || 0);
  }

  if (Array.isArray(generationImmediateMcqs) && generationImmediateMcqs.length >= 5) {
    return normalizeMcqs(generationImmediateMcqs);
  }

  if (generationResponseStatusCode === 200) {
    const existingMcqs = await getMcqs(gutenbergId, { limit: 5, timeoutMs: Math.min(timeoutMs, 12000) });
    if (Array.isArray(existingMcqs) && existingMcqs.length >= 5) {
      generationTriggerCache.delete(String(gutenbergId));
      return normalizeMcqs(existingMcqs);
    }
  }

  for (let attempt = 0; attempt < maxPollRetries; attempt += 1) {
    const mcqs = await getMcqs(gutenbergId, { limit: 5, timeoutMs: Math.min(timeoutMs, 12000) });
    if (Array.isArray(mcqs) && mcqs.length >= 5) {
      generationTriggerCache.delete(String(gutenbergId));
      return normalizeMcqs(mcqs);
    }

    const statusPayload = await checkStatus(gutenbergId, { timeoutMs: Math.min(timeoutMs, 8000) });
    const lastError = statusPayload?.book?.last_error || statusPayload?.last_error;
    const status = String(statusPayload?.book?.status || statusPayload?.status || '').toLowerCase();
    if (lastError || status === 'failed' || status === 'error') {
      generationTriggerCache.delete(String(gutenbergId));
      const error = new Error(lastError ? String(lastError) : 'Quiz generation failed.');
      error.statusCode = 502;
      throw error;
    }

    if (attempt < maxPollRetries - 1) {
      const waitMs = getBackoffMs(attempt, {
        baseMs: initialPollDelayMs,
        stepMs: pollBackoffStepMs,
        maxMs: maxPollDelayMs,
      });
      await delay(waitMs);
    }
  }

  const processingError = new Error('Quiz generation is taking longer than expected.');
  processingError.statusCode = 202;
  processingError.code = 'PROCESSING';
  throw processingError;
};

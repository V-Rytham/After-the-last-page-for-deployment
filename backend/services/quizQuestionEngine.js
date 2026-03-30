import { Book } from '../models/Book.js';

const DEFAULT_QUESTION_ENGINE_URL = 'https://deterministic-question-engine-3sd2.onrender.com';
const LEGACY_QUESTION_ENGINE_URL = 'https://deterministic-question-engine-1.onrender.com';

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
  const { payload } = await requestEngine({
    path: '/generate',
    timeoutMs,
    options: {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: gutenbergId }),
    },
    acceptedStatuses: [200, 202],
  });

  return payload || { status: 'processing' };
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

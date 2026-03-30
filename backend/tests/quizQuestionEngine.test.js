import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBookQuizQuestions } from '../services/quizQuestionEngine.js';
import { Book } from '../models/Book.js';

const buildResponse = (status, payload) => ({
  status,
  async json() {
    return payload;
  },
});

const sampleMcqs = () => ([
  { question: 'Q1', options: ['A', 'B'], correct_answer: 'A' },
  { question: 'Q2', options: ['A', 'B'], correct_answer: 'B' },
  { question: 'Q3', options: ['A', 'B'], correct_answer: 'A' },
  { question: 'Q4', options: ['A', 'B'], correct_answer: 'B' },
  { question: 'Q5', options: ['A', 'B'], correct_answer: 'A' },
]);

const withMocks = async (fn) => {
  const originalFindById = Book.findById;
  const originalFetch = global.fetch;

  Book.findById = () => ({
    select: async () => ({ gutenbergId: 123 }),
  });

  try {
    await fn();
  } finally {
    Book.findById = originalFindById;
    global.fetch = originalFetch;
  }
};

test('fetchBookQuizQuestions triggers /generate only once for concurrent requests of same book', async () => {
  await withMocks(async () => {
    let generateCalls = 0;
    let mcqCalls = 0;
    const callOrder = [];

    global.fetch = async (url, options = {}) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/generate')) {
        callOrder.push('generate');
        generateCalls += 1;
        return buildResponse(202, { status: 'processing' });
      }

      if (requestUrl.includes('/status/')) {
        callOrder.push('status');
        return buildResponse(200, { status: 'processing' });
      }

      if (requestUrl.includes('/mcqs/')) {
        callOrder.push('mcqs');
        mcqCalls += 1;
        if (mcqCalls < 3) {
          return buildResponse(200, { mcqs: [] });
        }
        return buildResponse(200, { mcqs: sampleMcqs() });
      }

      assert.fail(`Unexpected URL: ${requestUrl} (${options.method || 'GET'})`);
    };

    const [first, second] = await Promise.all([
      fetchBookQuizQuestions('book-1', {
        timeoutMs: 500,
        maxPollRetries: 4,
        initialPollDelayMs: 1,
        pollBackoffStepMs: 1,
        maxPollDelayMs: 2,
      }),
      fetchBookQuizQuestions('book-1', {
        timeoutMs: 500,
        maxPollRetries: 4,
        initialPollDelayMs: 1,
        pollBackoffStepMs: 1,
        maxPollDelayMs: 2,
      }),
    ]);

    assert.equal(first.length, 5);
    assert.equal(second.length, 5);
    assert.equal(generateCalls, 1);
    assert.equal(callOrder[0], 'generate');
  });
});

test('fetchBookQuizQuestions stops polling when status endpoint reports error', async () => {
  await withMocks(async () => {
    let statusCalls = 0;

    global.fetch = async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/generate')) {
        return buildResponse(202, { status: 'processing' });
      }

      if (requestUrl.includes('/mcqs/')) {
        return buildResponse(200, { mcqs: [] });
      }

      if (requestUrl.includes('/status/')) {
        statusCalls += 1;
        return buildResponse(200, { status: 'error', last_error: 'generator failed' });
      }

      assert.fail(`Unexpected URL: ${requestUrl}`);
    };

    await assert.rejects(
      () => fetchBookQuizQuestions('book-2', {
        timeoutMs: 500,
        maxPollRetries: 5,
        initialPollDelayMs: 1,
        pollBackoffStepMs: 1,
        maxPollDelayMs: 2,
      }),
      (error) => {
        assert.equal(error.statusCode, 502);
        assert.match(error.message, /generator failed/i);
        return true;
      },
    );

    assert.equal(statusCalls, 1);
  });
});

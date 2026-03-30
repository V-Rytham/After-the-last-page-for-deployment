import test from 'node:test';
import assert from 'node:assert/strict';
import { QuizJobManager } from '../services/quizJobManager.js';

const sampleQuestions = () => ([
  { question: 'Q1', options: ['a', 'b'], correctIndex: 0 },
  { question: 'Q2', options: ['a', 'b'], correctIndex: 1 },
  { question: 'Q3', options: ['a', 'b'], correctIndex: 0 },
  { question: 'Q4', options: ['a', 'b'], correctIndex: 1 },
  { question: 'Q5', options: ['a', 'b'], correctIndex: 0 },
]);

test('QuizJobManager runs background job and returns sanitized result', async () => {
  let fetchCalls = 0;
  const manager = new QuizJobManager({
    ttlMs: 60_000,
    questionFetcher: async () => {
      fetchCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return sampleQuestions();
    },
  });

  const status = manager.startJob({ userId: 'u1', bookId: 'b1' });
  assert.ok(status.jobId);
  assert.equal(status.bookId, 'b1');

  const deduped = manager.startJob({ userId: 'u1', bookId: 'b1' });
  assert.equal(deduped.jobId, status.jobId);

  for (let i = 0; i < 50; i += 1) {
    const latest = manager.getStatus({ userId: 'u1', jobId: status.jobId });
    assert.ok(latest);
    if (latest.status === 'completed') {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const result = manager.getResult({ userId: 'u1', jobId: status.jobId });
  assert.equal(result.status, 'completed');
  assert.equal(result.questions.length, 5);
  assert.equal(Object.prototype.hasOwnProperty.call(result.questions[0], 'correctIndex'), false);
  assert.equal(fetchCalls, 1);

  const full = manager.getLatestCompletedQuestions({ userId: 'u1', bookId: 'b1', jobId: status.jobId });
  assert.ok(Array.isArray(full));
  assert.equal(full.length, 5);
  assert.equal(typeof full[0].correctIndex, 'number');
});


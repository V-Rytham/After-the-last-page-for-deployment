import crypto from 'crypto';
import { fetchBookQuizQuestions } from './quizQuestionEngine.js';

const normalizeId = (value) => String(value || '').trim();

const buildJobId = () => `quiz_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

const STAGES = Object.freeze({
  ANALYZING: 'analyzing',
  GENERATING: 'generating',
  FINALIZING: 'finalizing',
});

const STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

const stageProgress = (stage, status) => {
  if (status === STATUS.COMPLETED) return 1;
  if (status === STATUS.FAILED) return 0;
  if (stage === STAGES.ANALYZING) return 0.2;
  if (stage === STAGES.GENERATING) return 0.6;
  if (stage === STAGES.FINALIZING) return 0.9;
  return 0.1;
};

export class QuizJobManager {
  constructor({
    ttlMs = 30 * 60 * 1000,
    questionFetcher = fetchBookQuizQuestions,
    maxJobs = 500,
  } = {}) {
    this.ttlMs = ttlMs;
    this.questionFetcher = questionFetcher;
    this.maxJobs = maxJobs;

    this.jobs = new Map(); // jobId -> job
    this.userBookIndex = new Map(); // `${userId}:${bookId}` -> jobId

    setInterval(() => this.sweep(), 60_000).unref?.();
  }

  _key(userId, bookId) {
    return `${normalizeId(userId)}:${normalizeId(bookId)}`;
  }

  _get(jobId) {
    const normalized = normalizeId(jobId);
    if (!normalized) return null;
    const job = this.jobs.get(normalized) || null;
    if (!job) return null;
    if (Date.now() - job.updatedAt > this.ttlMs) {
      this.jobs.delete(normalized);
      return null;
    }
    return job;
  }

  getStatus({ userId, jobId }) {
    const job = this._get(jobId);
    if (!job || normalizeId(job.userId) !== normalizeId(userId)) {
      return null;
    }

    return {
      jobId: job.jobId,
      status: job.status,
      stage: job.stage,
      progress: stageProgress(job.stage, job.status),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.status === STATUS.FAILED ? job.error : null,
      bookId: job.bookId,
    };
  }

  getResult({ userId, jobId }) {
    const job = this._get(jobId);
    if (!job || normalizeId(job.userId) !== normalizeId(userId)) {
      return null;
    }

    if (job.status !== STATUS.COMPLETED) {
      return { status: job.status, stage: job.stage, error: job.error || null };
    }

    return { status: job.status, questions: job.result || [] };
  }

  getLatestJobId({ userId, bookId }) {
    const jobId = this.userBookIndex.get(this._key(userId, bookId));
    return jobId || null;
  }

  getLatestCompletedQuestions({ userId, bookId, jobId }) {
    const normalizedUserId = normalizeId(userId);
    const normalizedBookId = normalizeId(bookId);
    const preferredJobId = normalizeId(jobId);

    const candidates = [];
    if (preferredJobId) candidates.push(preferredJobId);
    const indexed = this.getLatestJobId({ userId: normalizedUserId, bookId: normalizedBookId });
    if (indexed) candidates.push(indexed);

    for (const candidateId of candidates) {
      const job = this._get(candidateId);
      if (!job) continue;
      if (normalizeId(job.userId) !== normalizedUserId) continue;
      if (normalizeId(job.bookId) !== normalizedBookId) continue;
      if (job.status !== STATUS.COMPLETED) continue;
      if (Array.isArray(job.fullResult) && job.fullResult.length === 5) {
        return job.fullResult;
      }
    }

    return null;
  }

  startJob({ userId, bookId, force = false }) {
    const normalizedUserId = normalizeId(userId);
    const normalizedBookId = normalizeId(bookId);
    if (!normalizedUserId || !normalizedBookId) {
      const error = new Error('userId and bookId are required');
      error.statusCode = 400;
      throw error;
    }

    const key = this._key(normalizedUserId, normalizedBookId);
    const existingId = this.userBookIndex.get(key);
    const existing = existingId ? this._get(existingId) : null;

    if (!force && existing && normalizeId(existing.userId) === normalizedUserId) {
      if (existing.status === STATUS.QUEUED || existing.status === STATUS.RUNNING) {
        return this.getStatus({ userId: normalizedUserId, jobId: existing.jobId });
      }
      if (existing.status === STATUS.COMPLETED && Date.now() - existing.updatedAt < this.ttlMs) {
        return this.getStatus({ userId: normalizedUserId, jobId: existing.jobId });
      }
    }

    if (this.jobs.size >= this.maxJobs) {
      this.sweep({ aggressive: true });
    }

    const jobId = buildJobId();
    const now = Date.now();
    const job = {
      jobId,
      userId: normalizedUserId,
      bookId: normalizedBookId,
      status: STATUS.QUEUED,
      stage: STAGES.ANALYZING,
      createdAt: now,
      updatedAt: now,
      error: null,
      result: null,
      fullResult: null,
    };

    this.jobs.set(jobId, job);
    this.userBookIndex.set(key, jobId);

    queueMicrotask(() => {
      this._run(jobId).catch(() => {});
    });

    return this.getStatus({ userId: normalizedUserId, jobId });
  }

  async _run(jobId) {
    const job = this._get(jobId);
    if (!job || job.status !== STATUS.QUEUED) {
      return;
    }

    job.status = STATUS.RUNNING;
    job.stage = STAGES.ANALYZING;
    job.updatedAt = Date.now();

    try {
      job.stage = STAGES.GENERATING;
      job.updatedAt = Date.now();

      const fullQuestions = await this.questionFetcher(job.bookId, {
        timeoutMs: 45_000,
        pollIntervalMs: 2000,
        maxPollMs: 120_000,
      });

      job.stage = STAGES.FINALIZING;
      job.updatedAt = Date.now();

      job.fullResult = fullQuestions;
      job.result = fullQuestions.map((q) => ({
        question: q.question,
        options: q.options,
      }));
      job.status = STATUS.COMPLETED;
      job.updatedAt = Date.now();
      job.error = null;
    } catch (error) {
      job.status = STATUS.FAILED;
      job.updatedAt = Date.now();
      job.error = {
        message: String(error?.message || 'Quiz job failed.'),
        statusCode: Number(error?.statusCode || 500),
        code: error?.code ? String(error.code) : null,
      };
    }
  }

  sweep({ aggressive = false } = {}) {
    const now = Date.now();
    let removed = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (now - Number(job?.updatedAt || 0) > this.ttlMs) {
        this.jobs.delete(jobId);
        removed += 1;
      }
    }

    if (aggressive && this.jobs.size > this.maxJobs) {
      const sorted = [...this.jobs.values()].sort((a, b) => Number(a.updatedAt) - Number(b.updatedAt));
      const toRemove = Math.max(0, this.jobs.size - this.maxJobs);
      for (let i = 0; i < toRemove; i += 1) {
        const job = sorted[i];
        if (job) {
          this.jobs.delete(job.jobId);
          removed += 1;
        }
      }
    }

    // Rebuild index to avoid dangling pointers.
    for (const [key, jobId] of this.userBookIndex.entries()) {
      const job = this.jobs.get(jobId);
      if (!job || now - Number(job.updatedAt || 0) > this.ttlMs) {
        this.userBookIndex.delete(key);
      }
    }

    return removed;
  }
}

export const quizJobManager = new QuizJobManager();
export const QUIZ_JOB_STATUS = STATUS;
export const QUIZ_JOB_STAGES = STAGES;


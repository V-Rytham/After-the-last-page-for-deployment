import mongoose from 'mongoose';
import { buildSafeErrorBody } from '../utils/runtime.js';
import { resolveBookOrThrow } from '../services/accessService.js';
import { quizJobManager } from '../services/quizJobManager.js';

export const startQuizJob = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { bookId, force } = req.body || {};

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    if (!bookId || !mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: 'Valid bookId is required.' });
    }

    await resolveBookOrThrow(bookId);

    const status = quizJobManager.startJob({ userId, bookId, force: Boolean(force) });
    return res.status(202).json(status);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json(buildSafeErrorBody('Failed to start quiz job.', error));
  }
};

export const getQuizJobStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { jobId } = req.params || {};

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const status = quizJobManager.getStatus({ userId, jobId });
    if (!status) {
      return res.status(404).json({ message: 'Quiz job not found.' });
    }

    return res.json(status);
  } catch (error) {
    return res.status(500).json(buildSafeErrorBody('Failed to fetch quiz job status.', error));
  }
};

export const getQuizJobResult = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { jobId } = req.params || {};

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const result = quizJobManager.getResult({ userId, jobId });
    if (!result) {
      return res.status(404).json({ message: 'Quiz job not found.' });
    }

    if (result.status !== 'completed') {
      return res.status(202).json({
        status: result.status,
        stage: result.stage,
        error: result.error || null,
      });
    }

    return res.json({ questions: result.questions });
  } catch (error) {
    return res.status(500).json(buildSafeErrorBody('Failed to fetch quiz job result.', error));
  }
};


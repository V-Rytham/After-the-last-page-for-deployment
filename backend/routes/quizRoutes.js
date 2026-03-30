import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getQuizQuestions, submitQuiz } from '../controllers/quizController.js';
import { getQuizJobResult, getQuizJobStatus, startQuizJob } from '../controllers/quizJobController.js';

const router = express.Router();

router.post('/start', protect, startQuizJob);
router.get('/status/:jobId', protect, getQuizJobStatus);
router.get('/result/:jobId', protect, getQuizJobResult);
router.get('/questions', protect, getQuizQuestions);
router.post('/submit', protect, submitQuiz);

export default router;

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getQuizQuestions, submitQuiz } from '../controllers/quizController.js';

const router = express.Router();

router.get('/questions', protect, getQuizQuestions);
router.post('/submit', protect, submitQuiz);

export default router;

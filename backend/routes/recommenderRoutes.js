import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getRecommendations } from '../controllers/recommenderController.js';

const router = express.Router();

// POST /api/recommender
// Body: { currentBookId?: string, readBookIds?: string[], limitPerShelf?: number }
router.post('/', protect, getRecommendations);

export default router;


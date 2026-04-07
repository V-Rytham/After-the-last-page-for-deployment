import express from 'express';
import {
  getRecommendationsForYou,
  postRecommendationClick,
  postRecommendations,
} from '../controllers/recommendationsController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Existing recommender
router.post('/', postRecommendations);

// Hybrid recommender v2
router.get('/for-you', requireAuth, getRecommendationsForYou);
router.post('/for-you/click', requireAuth, postRecommendationClick);

export default router;

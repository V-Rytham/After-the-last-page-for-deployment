import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { createMatchmakingController } from '../controllers/matchmakingController.js';

export const buildMeetRoutes = (sessionManager) => {
  const router = express.Router();
  const controller = createMatchmakingController(sessionManager);

  router.post('/join', protect, controller.join);
  router.post('/leave', protect, controller.leave);

  return router;
};

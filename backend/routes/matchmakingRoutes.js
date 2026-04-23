import express from 'express';
import { attachIdentity } from '../middleware/identityMiddleware.js';
import { createMatchmakingController } from '../controllers/matchmakingController.js';

export const buildMatchmakingRoutes = (sessionManager) => {
  const router = express.Router();
  const controller = createMatchmakingController(sessionManager);

  router.post('/join', attachIdentity, controller.join);
  router.post('/leave', attachIdentity, controller.leave);

  return router;
};


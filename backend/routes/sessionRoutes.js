import express from 'express';
import { protectFlexible } from '../middleware/flexibleAuth.js';
import { createSessionController } from '../controllers/sessionController.js';

export const buildSessionRoutes = (sessionManager) => {
  const router = express.Router();
  const controller = createSessionController(sessionManager);

  router.get('/status', protectFlexible, controller.getStatus);
  router.post('/start', protectFlexible, controller.startSession);
  router.post('/end', protectFlexible, controller.endSession);

  return router;
};


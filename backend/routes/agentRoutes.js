import express from 'express';
import { endAgentSession, sendAgentMessage, startAgentSession } from '../controllers/agentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/start', protect, startAgentSession);
router.post('/message', protect, sendAgentMessage);
router.post('/end', protect, endAgentSession);

export default router;

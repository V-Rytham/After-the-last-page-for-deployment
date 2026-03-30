import express from 'express';
import { endAgentSession, sendAgentMessage, startAgentSession } from '../controllers/agentController.js';

const router = express.Router();

router.post('/start', startAgentSession);
router.post('/message', sendAgentMessage);
router.post('/end', endAgentSession);

export default router;

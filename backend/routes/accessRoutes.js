import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { checkAccess, checkAccessBatch, requestMeetFallback } from '../controllers/accessController.js';

const router = express.Router();

router.get('/check', protect, checkAccess);
router.post('/check-batch', protect, checkAccessBatch);
router.post('/fallback/meet', protect, requestMeetFallback);

export default router;

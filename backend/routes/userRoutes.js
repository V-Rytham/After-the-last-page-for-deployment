import express from 'express';
import {
  registerAnonymousUser,
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  checkUsernameAvailability,
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/username-availability', checkUsernameAvailability);
router.post('/anonymous', registerAnonymousUser);
router.post('/signup', registerUser);
router.post('/login', loginUser);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);

export default router;

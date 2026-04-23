import express from 'express';
import {
  registerAnonymousUser,
  checkUsernameAvailability,
} from '../controllers/userController.js';

const router = express.Router();

router.get('/username-availability', checkUsernameAvailability);
router.post('/anonymous', registerAnonymousUser);

export default router;

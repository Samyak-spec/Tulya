import { Router } from 'express';
import { login, me, register } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { createRequestRateLimit } from '../middleware/requestRateLimit.js';

const router = Router();
const authRateLimit = createRequestRateLimit({
  limit: 10,
  windowMs: 15 * 60_000,
  message: 'Too many authentication attempts; try again later',
});

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);
router.get('/me', requireAuth, me);

export default router;

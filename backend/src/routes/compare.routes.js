import { Router } from 'express';
import { compareController } from '../controllers/compareController.js';
import { createRequestRateLimit } from '../middleware/requestRateLimit.js';
import { swiggyOAuthSessionMiddleware } from '../middleware/swiggyOAuthSession.js';

const router = Router();

router.post(
  '/',
  swiggyOAuthSessionMiddleware,
  createRequestRateLimit({
    limit: 12,
    windowMs: 60_000,
    message: 'Provider offer comparisons are temporarily rate-limited',
  }),
  compareController,
);

export default router;

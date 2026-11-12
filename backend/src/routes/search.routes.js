import { Router } from 'express';
import { searchController } from '../controllers/searchController.js';
import { createRequestRateLimit } from '../middleware/requestRateLimit.js';

const router = Router();

router.post(
  '/',
  createRequestRateLimit({
    limit: 30,
    windowMs: 60_000,
    message: 'Search requests are temporarily rate-limited',
  }),
  searchController,
);

export default router;

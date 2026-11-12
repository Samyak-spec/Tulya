import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getRecommendationsController,
  recordInteractionController,
} from '../controllers/interactionController.js';
import { createRequestRateLimit } from '../middleware/requestRateLimit.js';
import {
  addFavoriteController,
  getFavoritesController,
  getPreferencesController,
  removeFavoriteController,
  updatePreferencesController,
} from '../controllers/userController.js';

const router = Router();

router.use('/me', requireAuth);
router.post(
  '/me/interactions',
  createRequestRateLimit({
    limit: 60,
    windowMs: 60_000,
    message: 'Interaction tracking is temporarily rate-limited',
  }),
  recordInteractionController,
);
router.get('/me/recommendations', getRecommendationsController);
router.get('/me/preferences', getPreferencesController);
router.patch('/me/preferences', updatePreferencesController);
router.get('/me/favorites', getFavoritesController);
router.post('/me/favorites/:restaurantId', addFavoriteController);
router.delete('/me/favorites/:restaurantId', removeFavoriteController);

export default router;

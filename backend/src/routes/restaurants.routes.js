import { Router } from 'express';
import {
  getRestaurantController,
  getRestaurantMenuController,
  getRestaurantOffersController,
  getRestaurantPhotoController,
  discoverRestaurantsController,
  matchRestaurantPhotoController,
  listRestaurantsController,
} from '../controllers/restaurantController.js';
import { createRequestRateLimit } from '../middleware/requestRateLimit.js';
import { swiggyOAuthSessionMiddleware } from '../middleware/swiggyOAuthSession.js';

const router = Router();

router.post(
  '/discover',
  createRequestRateLimit({
    limit: 20,
    windowMs: 60_000,
    message: 'Restaurant searches are temporarily rate-limited',
  }),
  discoverRestaurantsController,
);
router.post(
  '/photos/match',
  createRequestRateLimit({
    limit: 20,
    windowMs: 60_000,
    message: 'Restaurant photo matching is temporarily rate-limited',
  }),
  matchRestaurantPhotoController,
);
router.get(
  '/',
  createRequestRateLimit({
    limit: 12,
    windowMs: 60_000,
    message: 'Nearby restaurant searches are temporarily rate-limited',
  }),
  listRestaurantsController,
);
router.get(
  '/photos',
  createRequestRateLimit({
    limit: 60,
    windowMs: 60_000,
    message: 'Restaurant photo requests are temporarily rate-limited',
  }),
  getRestaurantPhotoController,
);
router.get('/:id', getRestaurantController);
router.get('/:id/offers', swiggyOAuthSessionMiddleware, getRestaurantOffersController);
router.get('/:id/menu', getRestaurantMenuController);

export default router;

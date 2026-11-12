import { Router } from 'express';
import {
  completeSwiggyAuthorizationController,
  disconnectSwiggyController,
  getSwiggyAddressesController,
  getSwiggySessionController,
  searchSwiggyRestaurantsController,
  selectSwiggyAddressController,
  startSwiggyAuthorizationController,
} from '../controllers/swiggyAuthController.js';
import { requireLocalSwiggyDevelopment } from '../middleware/requireLocalSwiggyDevelopment.js';
import { swiggyOAuthSessionMiddleware } from '../middleware/swiggyOAuthSession.js';
import { createRequestRateLimit } from '../middleware/requestRateLimit.js';

const router = Router();
router.use(requireLocalSwiggyDevelopment);
router.use(swiggyOAuthSessionMiddleware);

router.get('/auth/start', createRequestRateLimit({
  limit: 5,
  windowMs: 60_000,
  message: 'Swiggy authorization starts are temporarily rate-limited',
}), startSwiggyAuthorizationController);
router.get('/auth/callback', completeSwiggyAuthorizationController);
router.get('/session', getSwiggySessionController);
router.get('/addresses', getSwiggyAddressesController);
router.put('/address', selectSwiggyAddressController);
router.post('/restaurants/search', createRequestRateLimit({
  limit: 30,
  windowMs: 60_000,
  message: 'Swiggy restaurant searches are temporarily rate-limited',
}), searchSwiggyRestaurantsController);
router.post('/disconnect', disconnectSwiggyController);

export default router;

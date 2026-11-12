import { Router } from 'express';
import {
  createAdminRestaurantController,
  deleteAdminRestaurantController,
  listAdminRestaurantsController,
  updateAdminRestaurantController,
} from '../controllers/adminRestaurantController.js';
import { requireRestaurantAdmin } from '../middleware/requireRestaurantAdmin.js';
import { createRequestRateLimit } from '../middleware/requestRateLimit.js';

const router = Router();
router.use(requireRestaurantAdmin);
router.use(createRequestRateLimit({
  limit: 60,
  windowMs: 60_000,
  message: 'Restaurant administration is temporarily rate-limited',
}));

router.get('/restaurants', listAdminRestaurantsController);
router.post('/restaurants', createAdminRestaurantController);
router.put('/restaurants/:id', updateAdminRestaurantController);
router.delete('/restaurants/:id', deleteAdminRestaurantController);

export default router;

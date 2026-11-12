import { Router } from 'express';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import compareRoutes from './compare.routes.js';
import healthRoutes from './health.routes.js';
import restaurantsRoutes from './restaurants.routes.js';
import searchRoutes from './search.routes.js';
import swiggyRoutes from './swiggy.routes.js';
import usersRoutes from './users.routes.js';

const router = Router();

router.use('/admin', adminRoutes);
router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/restaurants', restaurantsRoutes);
router.use('/compare', compareRoutes);
router.use('/ai/search', searchRoutes);
router.use('/users', usersRoutes);
router.use('/swiggy', swiggyRoutes);

export default router;

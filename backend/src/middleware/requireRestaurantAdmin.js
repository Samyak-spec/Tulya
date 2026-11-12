import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export const requireRestaurantAdmin = (req, res, next) => {
  const configuredKey = env.RESTAURANT_ADMIN_API_KEY;
  if (!configuredKey) {
    return res.status(503).json({
      success: false,
      message: 'Restaurant administration is not configured',
    });
  }

  const suppliedKey = req.get('x-admin-key');
  if (typeof suppliedKey !== 'string') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const expected = Buffer.from(configuredKey);
  const supplied = Buffer.from(suppliedKey);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  return next();
};

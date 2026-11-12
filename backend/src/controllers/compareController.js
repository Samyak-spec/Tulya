import { z } from 'zod';
import { compareRequestSchema, compareRestaurants } from '../services/dealService.js';

export const compareController = async (req, res, next) => {
  try {
    const payload = compareRequestSchema.parse(req.body);
    const data = await compareRestaurants(payload, {
      swiggySession: req.swiggyOAuthSession,
      userLocation: payload.userLocation,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new Error('Invalid comparison request');
      validationError.statusCode = 400;
      validationError.details = error.flatten();
      return next(validationError);
    }

    return next(error);
  }
};

import { z } from 'zod';
import {
  getPersonalizedRecommendations,
  interactionSchema,
  recordRestaurantInteraction,
} from '../services/interactionService.js';

const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

const forwardValidationError = (error, next) => {
  if (!(error instanceof z.ZodError)) {
    return next(error);
  }

  const validationError = new Error('Invalid interaction request');
  validationError.statusCode = 400;
  validationError.details = error.flatten();
  return next(validationError);
};

export const recordInteractionController = async (req, res, next) => {
  try {
    interactionSchema.parse(req.body);
    const data = await recordRestaurantInteraction(req.user.id, req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return forwardValidationError(error, next);
  }
};

export const getRecommendationsController = async (req, res, next) => {
  try {
    const { limit } = recommendationQuerySchema.parse(req.query);
    const data = await getPersonalizedRecommendations(req.user.id, limit);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return forwardValidationError(error, next);
  }
};

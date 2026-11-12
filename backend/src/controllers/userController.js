import { z } from 'zod';
import {
  addFavoriteRestaurant,
  getFavoriteRestaurants,
  getUserPreferences,
  preferencesSchema,
  removeFavoriteRestaurant,
  updateUserPreferences,
} from '../services/userService.js';

const favoriteParamsSchema = z.object({
  restaurantId: z.string().trim().min(1).max(100),
});

const sendValidationError = (error, next) => {
  if (!(error instanceof z.ZodError)) {
    return next(error);
  }

  const validationError = new Error('Invalid user request');
  validationError.statusCode = 400;
  validationError.details = error.flatten();
  return next(validationError);
};

export const getPreferencesController = async (req, res, next) => {
  try {
    const data = await getUserPreferences(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const updatePreferencesController = async (req, res, next) => {
  try {
    preferencesSchema.parse(req.body);
    const data = await updateUserPreferences(req.user.id, req.body);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendValidationError(error, next);
  }
};

export const getFavoritesController = async (req, res, next) => {
  try {
    const data = await getFavoriteRestaurants(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const addFavoriteController = async (req, res, next) => {
  try {
    const { restaurantId } = favoriteParamsSchema.parse(req.params);
    const data = await addFavoriteRestaurant(req.user.id, restaurantId);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return sendValidationError(error, next);
  }
};

export const removeFavoriteController = async (req, res, next) => {
  try {
    const { restaurantId } = favoriteParamsSchema.parse(req.params);
    const data = await removeFavoriteRestaurant(req.user.id, restaurantId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendValidationError(error, next);
  }
};

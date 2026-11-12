import { z } from 'zod';
import {
  createStoredRestaurant,
  deleteStoredRestaurant,
  updateStoredRestaurant,
} from '../store/restaurants.js';
import { listRestaurants } from '../services/restaurantService.js';

const menuItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).optional(),
  price: z.number().nonnegative().optional(),
  vegetarian: z.boolean().optional(),
  spicyLevel: z.number().int().min(0).max(5).optional(),
}).strict();

const restaurantFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  cuisines: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  description: z.string().trim().max(1000).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  priceRange: z.union([z.string().trim().max(40), z.number().nonnegative()]).nullable().optional(),
  vegetarianFriendly: z.boolean().optional(),
  location: z.object({
    city: z.string().trim().max(100).optional(),
    address: z.string().trim().max(250).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }).strict().optional(),
  image: z.string().trim().max(1000).nullable().optional(),
  images: z.array(z.string().trim().max(1000)).max(20).optional(),
  deliveryMode: z.enum(['delivery', 'dine-in']).nullable().optional(),
  menuPreview: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  menu: z.array(menuItemSchema).max(200).optional(),
  platforms: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
}).strict();

const createRestaurantSchema = restaurantFieldsSchema.extend({
  id: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
const updateRestaurantSchema = restaurantFieldsSchema.partial();
const idParamSchema = z.object({ id: z.string().trim().min(1).max(180) });

const respondValidationError = (error, next) => {
  if (!(error instanceof z.ZodError)) {
    return next(error);
  }

  const validationError = new Error('Invalid restaurant administration request');
  validationError.statusCode = 400;
  validationError.details = error.flatten();
  return next(validationError);
};

const respondStoreError = (error, next) => {
  if (error.code === 11000) {
    error.statusCode = 409;
    error.message = 'Restaurant ID or slug already exists';
  }
  return next(error);
};

export const listAdminRestaurantsController = async (_req, res, next) => {
  try {
    const data = await listRestaurants();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const createAdminRestaurantController = async (req, res, next) => {
  try {
    const payload = createRestaurantSchema.parse(req.body);
    const data = await createStoredRestaurant(payload);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respondValidationError(error, next);
    }
    return respondStoreError(error, next);
  }
};

export const updateAdminRestaurantController = async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const updates = updateRestaurantSchema.parse(req.body);
    if (Object.keys(updates).length === 0) {
      const error = new Error('At least one restaurant field is required');
      error.statusCode = 400;
      throw error;
    }

    const data = await updateStoredRestaurant(id, updates);
    if (!data) {
      const error = new Error('Restaurant not found');
      error.statusCode = 404;
      throw error;
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respondValidationError(error, next);
    }
    return respondStoreError(error, next);
  }
};

export const deleteAdminRestaurantController = async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const deleted = await deleteStoredRestaurant(id);
    if (!deleted) {
      const error = new Error('Restaurant not found');
      error.statusCode = 404;
      throw error;
    }
    return res.status(200).json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respondValidationError(error, next);
    }
    return next(error);
  }
};

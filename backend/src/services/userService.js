import { z } from 'zod';
import { findRestaurantById } from './restaurantService.js';
import { getUserById, sanitizeUser } from './authService.js';
import { updateUserById } from '../store/users.js';

export const preferencesSchema = z.object({
  location: z.string().trim().min(2).max(80).nullable().optional(),
  dietaryPreferences: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  cuisinePreferences: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  budgetPreferences: z.array(z.number().min(0).max(1_000_000)).max(20).optional(),
  preferredPlatforms: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

const getUserOrThrow = async (id) => {
  const user = await getUserById(id);
  return user;
};

export const getUserPreferences = async (id) => {
  const user = await getUserOrThrow(id);
  return {
    location: user.location,
    dietaryPreferences: user.dietaryPreferences,
    cuisinePreferences: user.cuisinePreferences,
    budgetPreferences: user.budgetPreferences,
    preferredPlatforms: user.preferredPlatforms,
  };
};

export const updateUserPreferences = async (id, payload) => {
  const updates = preferencesSchema.parse(payload);
  await getUserOrThrow(id);
  const user = await updateUserById(id, updates);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return getUserPreferences(id);
};

export const getFavoriteRestaurants = async (id) => {
  const user = await getUserOrThrow(id);
  return (await Promise.all(user.favoriteRestaurants.map(findRestaurantById))).filter(Boolean);
};

export const addFavoriteRestaurant = async (userId, restaurantId) => {
  const restaurant = await findRestaurantById(restaurantId);
  if (!restaurant) {
    const error = new Error('Restaurant not found');
    error.statusCode = 404;
    throw error;
  }

  const user = await getUserOrThrow(userId);
  const favoriteRestaurants = [...new Set([...user.favoriteRestaurants, restaurant.id])];
  await updateUserById(userId, { favoriteRestaurants });
  return restaurant;
};

export const removeFavoriteRestaurant = async (userId, restaurantId) => {
  await getUserOrThrow(userId);
  const restaurant = await findRestaurantById(restaurantId);
  if (!restaurant) {
    const error = new Error('Restaurant not found');
    error.statusCode = 404;
    throw error;
  }

  const user = await getUserById(userId);
  const favoriteRestaurants = user.favoriteRestaurants.filter((id) => id !== restaurant.id);
  await updateUserById(userId, { favoriteRestaurants });
  return { restaurantId: restaurant.id, removed: true };
};

export const getSanitizedUser = async (id) => sanitizeUser(await getUserById(id));

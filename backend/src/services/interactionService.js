import { z } from 'zod';
import { addStoredInteraction, listStoredInteractions } from '../store/interactions.js';
import { findRestaurantById, listRestaurants } from './restaurantService.js';
import { getUserById } from './authService.js';

export const interactionSchema = z.object({
  restaurantId: z.string().trim().min(1).max(180),
  event: z.enum(['view', 'offer_click']),
}).strict();

export const recordRestaurantInteraction = async (userId, payload) => {
  const interaction = interactionSchema.parse(payload);
  const restaurant = await findRestaurantById(interaction.restaurantId);
  if (!restaurant) {
    const error = new Error('Restaurant not found');
    error.statusCode = 404;
    throw error;
  }

  await addStoredInteraction({
    userId,
    restaurantId: restaurant.id,
    event: interaction.event,
  });
  return { restaurantId: restaurant.id, event: interaction.event };
};

const normalizeCuisine = (cuisine) => cuisine.trim().toLocaleLowerCase();

export const getPersonalizedRecommendations = async (userId, limit = 10) => {
  const user = await getUserById(userId);
  const [restaurants, interactions] = await Promise.all([
    listRestaurants(),
    listStoredInteractions(userId, 200),
  ]);

  const cuisineScores = new Map();
  const interactionWeights = { view: 1, offer_click: 2 };
  for (const interaction of interactions) {
    const restaurant = restaurants.find((entry) => entry.id === interaction.restaurantId);
    const weight = interactionWeights[interaction.event] || 0;
    for (const cuisine of restaurant?.cuisines || []) {
      const key = normalizeCuisine(cuisine);
      cuisineScores.set(key, (cuisineScores.get(key) || 0) + weight);
    }
  }

  for (const cuisine of user.cuisinePreferences || []) {
    const key = normalizeCuisine(cuisine);
    cuisineScores.set(key, (cuisineScores.get(key) || 0) + 2);
  }

  for (const favoriteId of user.favoriteRestaurants || []) {
    const favorite = restaurants.find((restaurant) => restaurant.id === favoriteId);
    for (const cuisine of favorite?.cuisines || []) {
      const key = normalizeCuisine(cuisine);
      cuisineScores.set(key, (cuisineScores.get(key) || 0) + 3);
    }
  }

  const prefersVegetarian = (user.dietaryPreferences || []).some((preference) => (
    /vegetarian|vegan/i.test(preference)
  ));
  const ranked = restaurants
    .filter((restaurant) => !prefersVegetarian || restaurant.vegetarianFriendly)
    .map((restaurant) => {
      const cuisineScore = (restaurant.cuisines || []).reduce((score, cuisine) => (
        score + (cuisineScores.get(normalizeCuisine(cuisine)) || 0)
      ), 0);
      const ratingScore = Number(restaurant.rating || 0) / 5;
      const score = Number((cuisineScore + ratingScore).toFixed(3));
      return {
        ...restaurant,
        recommendationScore: score,
        recommendationReason: cuisineScore > 0
          ? 'Matches cuisines from your preferences and recent activity.'
          : 'Recommended from the available restaurant catalog.',
      };
    })
    .sort((left, right) => (
      right.recommendationScore - left.recommendationScore
      || (right.rating || 0) - (left.rating || 0)
    ))
    .slice(0, limit);

  return ranked;
};

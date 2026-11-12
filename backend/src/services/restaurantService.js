import { z } from 'zod';
import { findStoredRestaurant, listStoredRestaurants } from '../store/restaurants.js';

export const restaurantQuerySchema = z.object({
  location: z.string().trim().optional(),
  budget: z.coerce.number().min(0).optional(),
  people: z.coerce.number().min(1).optional(),
  cuisine: z.string().trim().optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  vegetarian: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === 'string') {
        return ['true', '1', 'yes'].includes(value.toLowerCase());
      }
      return value;
    }),
  distance: z.coerce.number().min(0).max(60).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  mode: z.enum(['dine-in', 'delivery']).optional(),
}).superRefine((filters, context) => {
  if ((filters.latitude === undefined) !== (filters.longitude === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Latitude and longitude must be provided together',
      path: [filters.latitude === undefined ? 'latitude' : 'longitude'],
    });
  }
});

const distanceBetweenKm = (latitudeA, longitudeA, latitudeB, longitudeB) => {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const getBestOffer = (offers = []) =>
  offers.reduce((best, offer) => {
    if (!best) {
      return offer;
    }

    return offer.effectivePrice < best.effectivePrice ? offer : best;
  }, null);

export const getOfferSavings = (offer = {}) => Math.max(offer.originalPrice - offer.effectivePrice, 0);

const matchesBudget = (restaurant, budget) => {
  const bestOffer = (restaurant.offers || []).filter((offer) => offer.isVerified === true)
    .reduce((best, offer) => (
      !best || offer.effectivePrice < best.effectivePrice ? offer : best
    ), null);
  return bestOffer ? bestOffer.effectivePrice <= budget : true;
};

const normalizeRestaurant = (restaurant) => ({
  ...restaurant,
  cuisine: restaurant.cuisines?.[0] || 'General',
  location: restaurant.location?.city || restaurant.location || 'Unknown',
  latitude: restaurant.location?.latitude,
  longitude: restaurant.location?.longitude,
  offers: (restaurant.offers || []).map((offer) => ({
    ...offer,
    provider: offer.provider || offer.platform?.toLowerCase(),
    originalAmount: offer.originalPrice,
    discountAmount: offer.discount,
    finalAmount: offer.effectivePrice,
    savings: getOfferSavings(offer),
    isVerified: offer.isVerified === true,
    isSampleData: offer.isVerified !== true,
  })),
  menuPreview: restaurant.menuPreview || (restaurant.menu || []).map((item) => item.name),
  image: restaurant.image || restaurant.images?.[0],
  city: restaurant.location?.city || restaurant.location || 'Unknown',
});

export const listRestaurants = async (filters = {}) => {
  const parsedFilters = restaurantQuerySchema.parse(filters);
  let results = (await listStoredRestaurants()).map((entry) => {
    const restaurant = normalizeRestaurant(entry);

    if (parsedFilters.latitude !== undefined && restaurant.latitude !== undefined && restaurant.longitude !== undefined) {
      restaurant.distance = distanceBetweenKm(
        parsedFilters.latitude,
        parsedFilters.longitude,
        restaurant.latitude,
        restaurant.longitude,
      );
    }

    return restaurant;
  });

  if (parsedFilters.location) {
    const value = parsedFilters.location.toLowerCase();
    results = results.filter((restaurant) => {
      const city = (restaurant.city || restaurant.location || '').toString().toLowerCase();
      const cuisines = (restaurant.cuisines || []).join(' ').toLowerCase();
      return city.includes(value) || cuisines.includes(value);
    });
  }

  if (parsedFilters.budget !== undefined) {
    results = results.filter((restaurant) => matchesBudget(restaurant, parsedFilters.budget));
  }

  if (parsedFilters.people) {
    results = results.filter((restaurant) => {
      const bestOffer = getBestOffer(restaurant.offers);
      return bestOffer ? bestOffer.effectivePrice / parsedFilters.people <= 1500 : true;
    });
  }

  if (parsedFilters.cuisine) {
    const value = parsedFilters.cuisine.toLowerCase();
    results = results.filter((restaurant) =>
      (restaurant.cuisines || []).some((cuisine) => cuisine.toLowerCase().includes(value)),
    );
  }

  if (parsedFilters.rating) {
    results = results.filter((restaurant) => restaurant.rating >= parsedFilters.rating);
  }

  if (parsedFilters.vegetarian !== undefined) {
    results = results.filter((restaurant) => restaurant.vegetarianFriendly === parsedFilters.vegetarian);
  }

  if (parsedFilters.distance !== undefined) {
    results = results.filter((restaurant) => (
      restaurant.distance !== undefined && restaurant.distance <= parsedFilters.distance
    ));
  }

  if (parsedFilters.mode) {
    results = results.filter((restaurant) => (restaurant.deliveryMode || '').toLowerCase() === parsedFilters.mode.toLowerCase());
  }

  return results.sort((left, right) => {
    if (parsedFilters.latitude !== undefined && left.distance !== right.distance) {
      return left.distance - right.distance;
    }

    const leftBest = getBestOffer(left.offers);
    const rightBest = getBestOffer(right.offers);
    const leftScore = leftBest ? leftBest.effectivePrice : Number.POSITIVE_INFINITY;
    const rightScore = rightBest ? rightBest.effectivePrice : Number.POSITIVE_INFINITY;
    return leftScore - rightScore || right.rating - left.rating;
  });
};

export const findRestaurantById = async (id) => {
  const restaurant = await findStoredRestaurant(id);
  return restaurant ? normalizeRestaurant(restaurant) : null;
};

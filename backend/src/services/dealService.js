import { z } from 'zod';
import { listRestaurants } from './restaurantService.js';
import { getProviderOffers } from './providerOfferService.js';

export const compareRequestSchema = z.object({
  mode: z.literal('dine-in').default('dine-in'),
  userLocation: z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
  }).strict().optional(),
  location: z.string().trim().min(1).optional().transform((value) => (value ? value.trim() : undefined)),
  people: z.coerce.number().int().min(1).default(2),
  budget: z.coerce.number().min(0).default(2000),
  cuisine: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }

      if (Array.isArray(value)) {
        return value.filter(Boolean).map((entry) => entry.trim());
      }

      return value.trim();
    }),
  restaurant: z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    providerId: z.string().optional(),
    providerIds: z.record(z.string()).optional(),
    cuisines: z.array(z.string()).optional(),
    cuisine: z.string().optional(),
    location: z.union([
      z.string(),
      z.object({
        city: z.string().optional(),
        address: z.string().optional(),
        latitude: z.coerce.number().optional(),
        longitude: z.coerce.number().optional(),
      }).passthrough(),
    ]).optional(),
    address: z.string().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    rating: z.coerce.number().min(0).max(5).nullable().optional(),
    description: z.string().optional(),
    image: z.string().nullable().optional(),
    menuPreview: z.array(z.string()).optional(),
    priceRange: z.union([z.string(), z.number()]).nullable().optional(),
    source: z.string().optional(),
  }).passthrough().optional(),
});

const scoreWeights = {
  price: 0.35,
  savings: 0.2,
  rating: 0.2,
  distance: 0.15,
  preference: 0.05,
  reliability: 0.05,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizePreference = (restaurant, request) => {
  const targetCuisine = Array.isArray(request.cuisine)
    ? request.cuisine.map((value) => value.toLowerCase())
    : request.cuisine
      ? [request.cuisine.toLowerCase()]
      : [];

  if (targetCuisine.length === 0) {
    return 0.7;
  }

  const match = (restaurant.cuisines || []).some((cuisine) =>
    targetCuisine.some((value) => cuisine.toLowerCase().includes(value)),
  );

  return match ? 1 : 0.5;
};

const normalizeScore = (value, min, max) => {
  if (max <= min) {
    return 100;
  }

  return clamp(((value - min) / (max - min)) * 100, 0, 100);
};

const calculateDealScore = (restaurant, filters) => {
  const offers = (restaurant.offers || []).filter((offer) => (
    offer.isVerified === true && Number.isFinite(offer.finalPrice)
  ));

  if (offers.length === 0) {
    return 0;
  }

  const bestOffer = offers.reduce((best, offer) => {
    if (!best || offer.finalPrice < best.finalPrice) {
      return offer;
    }

    return best;
  }, offers[0]);

  const priceMin = Math.min(...offers.map((offer) => offer.finalPrice));
  const priceMax = Math.max(...offers.map((offer) => offer.finalPrice), 1);
  const savingsMax = Math.max(...offers.map((offer) => offer.discount), 1);
  const priceScore = priceMax === priceMin
    ? 100
    : 100 - normalizeScore(bestOffer.finalPrice, priceMin, priceMax);
  const savingsScore = normalizeScore(bestOffer.discount || 0, 0, savingsMax);
  const ratingScore = ((restaurant.rating || 0) / 5) * 100;
  const distanceScore = clamp(100 - (restaurant.distance || 0) * 12, 0, 100);
  const preferenceScore = normalizePreference(restaurant, filters) * 100;
  const reliabilityScore = 100;

  const weightedTotal =
    scoreWeights.price * priceScore +
    scoreWeights.savings * savingsScore +
    scoreWeights.rating * ratingScore +
    scoreWeights.distance * distanceScore +
    scoreWeights.preference * preferenceScore +
    scoreWeights.reliability * reliabilityScore;

  return Number.isFinite(weightedTotal) ? weightedTotal : 0;
};

const calculateOfferScore = (offer, restaurant) => {
  const verifiedOffers = (restaurant.offers || []).filter((item) => (
    item.isVerified === true && Number.isFinite(item.finalPrice)
  ));
  const values = verifiedOffers.map((item) => item.finalPrice);
  const minPrice = Math.min(...values, offer.finalPrice);
  const maxPrice = Math.max(...values, offer.finalPrice, 1);
  const priceBand = maxPrice - minPrice || 1;
  const priceScore = 100 - ((offer.finalPrice - minPrice) / priceBand) * 100;
  const savingsScore = ((offer.discount ?? 0)
    / Math.max(verifiedOffers.reduce((sum, item) => sum + (item.discount ?? 0), 0), 1)) * 100;

  return clamp(Math.round(priceScore * 0.7 + savingsScore * 0.3), 0, 100);
};

const sortResults = (left, right) => {
  if (right.dealScore !== left.dealScore) {
    return right.dealScore - left.dealScore;
  }

  return (left.bestOffer?.finalPrice ?? Number.POSITIVE_INFINITY)
    - (right.bestOffer?.finalPrice ?? Number.POSITIVE_INFINITY);
};

const toComparisonOffer = (offer, restaurant) => ({
  ...offer,
  platform: offer.provider,
  originalAmount: offer.originalPrice,
  discountAmount: offer.discount,
  effectivePrice: offer.finalPrice,
  finalAmount: offer.finalPrice,
  couponCode: offer.code,
  savings: Number.isFinite(offer.originalPrice) && Number.isFinite(offer.finalPrice)
    ? Math.max(offer.originalPrice - offer.finalPrice, 0)
    : null,
  verified: offer.isVerified,
  dealScore: 0,
  isBest: false,
  ...(offer.isVerified && Number.isFinite(offer.finalPrice)
    ? { dealScore: calculateOfferScore(offer, restaurant) }
    : {}),
});

export const buildComparisonResult = async (
  restaurant,
  filters,
  providerResults,
  context = {},
) => {
  const resultsFromProviders = providerResults || await getProviderOffers(restaurant, context);
  const providerStatuses = resultsFromProviders.map(({ provider, status, message, providerRestaurantId }) => ({
    provider,
    status,
    ...(message ? { message } : {}),
    ...(providerRestaurantId ? { providerRestaurantId } : {}),
  }));
  const offers = resultsFromProviders.flatMap(({ offers: providerOffers }) => providerOffers)
    .filter((offer) => (
      offer.isVerified === true
      && ['dine-in', 'table-booking'].includes(offer.offerType)
    ))
    .map((offer) => toComparisonOffer(offer, restaurant));
  const verifiedOffers = offers.filter((offer) => offer.isVerified && Number.isFinite(offer.finalPrice));
  const bestOffer = verifiedOffers.reduce((best, offer) => (
    !best || offer.finalPrice < best.finalPrice ? offer : best
  ), null);
  if (bestOffer) bestOffer.isBest = true;
  const dealScore = Math.round(calculateDealScore({ ...restaurant, offers }, filters));
  const dineoutRestaurantId = resultsFromProviders.find(
    ({ provider }) => provider === 'swiggy_dineout',
  )?.providerRestaurantId;

  return {
    restaurantId: restaurant.id,
    name: restaurant.name,
    cuisine: restaurant.cuisine || restaurant.cuisines?.[0] || 'Restaurant',
    rating: restaurant.rating ?? null,
    location: restaurant.location,
    distance: restaurant.distance,
    image: restaurant.image,
    providerIds: {
      ...(restaurant.providerIds || {}),
      ...(dineoutRestaurantId ? { swiggyDineout: dineoutRestaurantId } : {}),
    },
    bestOffer,
    offers,
    providerStatuses,
    dealScore,
  };
};

export const compareRestaurants = async (payload = {}, context = {}) => {
  const filters = compareRequestSchema.parse(payload);
  const providerContext = {
    ...context,
    userLocation: filters.userLocation,
  };
  const matchedRestaurants = filters.restaurant
    ? [Object.fromEntries(Object.entries(filters.restaurant).filter(([key]) => key !== 'offers'))]
    : await listRestaurants({
      location: filters.location,
      budget: filters.budget,
      cuisine: Array.isArray(filters.cuisine) ? filters.cuisine[0] : filters.cuisine,
      people: filters.people,
      mode: filters.mode,
    });
  const results = (await Promise.all(matchedRestaurants.map((restaurant) => (
    buildComparisonResult(restaurant, filters, undefined, providerContext)
  )))).sort(sortResults);

  return {
    mode: filters.mode,
    location: filters.location || 'Any',
    people: filters.people,
    budget: filters.budget,
    results,
  };
};

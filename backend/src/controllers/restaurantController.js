import { z } from 'zod';
import {
  fetchGooglePlacePhoto,
  findGoogleRestaurantPhoto,
  getGooglePlaceDetails,
  searchGooglePlacesRestaurants,
} from '../adapters/googlePlacesAdapter.js';
import {
  findRestaurantById,
} from '../services/restaurantService.js';
import { attachProviderOffers } from '../services/providerOfferService.js';

const idParamSchema = z.object({
  id: z.string().min(1),
});

const discoverySchema = z.object({
  query: z.string().trim().max(200).default(''),
  location: z.string().trim().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  distance: z.number().min(1).max(30).default(15),
}).superRefine((input, context) => {
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Latitude and longitude must be provided together',
      path: [input.latitude === undefined ? 'latitude' : 'longitude'],
    });
  }
});

const photoMatchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  location: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  googlePlaceId: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).superRefine((input, context) => {
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Latitude and longitude must be provided together',
      path: [input.latitude === undefined ? 'latitude' : 'longitude'],
    });
  }
});

export const discoverRestaurantsController = async (req, res, next) => {
  try {
    const input = discoverySchema.parse(req.body);
    const result = await searchGooglePlacesRestaurants(input);

    return res.status(200).json({
      success: true,
      data: {
        location: result.area,
        locationFallback: result.locationFallback,
        restaurants: result.restaurants,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new Error('Invalid restaurant discovery request');
      validationError.statusCode = 400;
      return next(validationError);
    }
    return next(error);
  }
};

export const matchRestaurantPhotoController = async (req, res, next) => {
  try {
    const input = photoMatchSchema.parse(req.body);
    const result = await findGoogleRestaurantPhoto(input);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new Error('Invalid restaurant photo match request');
      validationError.statusCode = 400;
      return next(validationError);
    }
    return next(error);
  }
};

export const listRestaurantsController = async (req, res, next) => {
  const error = new Error('Restaurant discovery requires an authenticated search area');
  error.statusCode = 410;
  return next(error);
};

export const getRestaurantPhotoController = async (req, res, next) => {
  try {
    const { name } = z.object({
      name: z.string().regex(/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/),
    }).parse(req.query);
    const { body, contentType } = await fetchGooglePlacePhoto(name);

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new Error('Invalid restaurant photo reference');
      validationError.statusCode = 400;
      return next(validationError);
    }

    return next(error);
  }
};

export const getRestaurantController = async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const googlePlaceId = id.startsWith('google:')
      ? id.slice('google:'.length)
      : id.startsWith('google-place-')
        ? id.slice('google-place-'.length)
        : null;
    if (googlePlaceId) {
      const restaurant = await getGooglePlaceDetails(googlePlaceId);
      return res.status(200).json({
        success: true,
        data: restaurant,
      });
    }

    const restaurant = await findRestaurantById(id);

    if (!restaurant) {
      const error = new Error('Restaurant not found');
      error.statusCode = 404;
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: restaurant,
    });
  } catch (error) {
    return next(error);
  }
};

export const getRestaurantOffersController = async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const restaurant = await findRestaurantById(id);

    if (!restaurant) {
      const error = new Error('Restaurant not found');
      error.statusCode = 404;
      throw error;
    }

    const restaurantWithOffers = await attachProviderOffers(restaurant, {
      swiggySession: req.swiggyOAuthSession,
    });
    return res.status(200).json({
      success: true,
      data: restaurantWithOffers.offers,
      meta: {
        providerStatuses: restaurantWithOffers.providerStatuses,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getRestaurantMenuController = async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const restaurant = await findRestaurantById(id);

    if (!restaurant) {
      const error = new Error('Restaurant not found');
      error.statusCode = 404;
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: restaurant.menu,
    });
  } catch (error) {
    return next(error);
  }
};

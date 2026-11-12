import { z } from 'zod';
import { logger } from '../config/logger.js';
import { swiggyOAuthSessionStore } from '../providers/swiggyOAuthSession.js';
import { clearSwiggyOAuthSessionCookie } from '../middleware/swiggyOAuthSession.js';

const addressPageSchema = z.coerce.number().int().min(1).max(100);
const selectAddressSchema = z.object({
  addressId: z.string().trim().min(1).max(200),
}).strict();
const restaurantSearchSchema = z.object({
  addressId: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(200),
  offset: z.number().int().min(0).max(100_000).optional(),
}).strict();

const callbackPage = (message, statusCode = 200) => {
  const safeMessage = message.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
  return {
    statusCode,
    html: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Swiggy connection</title><body><main><h1>Swiggy connection</h1><p>${safeMessage}</p><p>You can close this tab and return to Tulya.</p></main></body></html>`,
  };
};

const setPrivateResponseHeaders = (res) => {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
};

export const startSwiggyAuthorizationController = async (req, res, next) => {
  try {
    const authorizationUrl = await req.swiggyOAuthSession.startAuthorization();
    setPrivateResponseHeaders(res);
    return res.redirect(302, authorizationUrl);
  } catch (error) {
    return next(error);
  }
};

export const completeSwiggyAuthorizationController = async (req, res) => {
  setPrivateResponseHeaders(res);
  if (typeof req.query.error === 'string') {
    const page = callbackPage('Swiggy authorization was not completed. Start again from the local backend.', 400);
    return res.status(page.statusCode).type('html').send(page.html);
  }

  try {
    const result = await req.swiggyOAuthSession.completeAuthorization({
      code: req.query.code,
      state: req.query.state,
    });
    const page = callbackPage(
      `Restaurant search is connected. The session expires at ${result.expiresAt}. Choose a saved location to discover nearby restaurants.`,
    );
    return res.status(page.statusCode).type('html').send(page.html);
  } catch (error) {
    logger.warn('Swiggy local OAuth callback failed', { errorType: error.name });
    const page = callbackPage('Swiggy could not be connected. Restart authorization from the local backend.', 400);
    return res.status(page.statusCode).type('html').send(page.html);
  }
};

export const getSwiggySessionController = (req, res) => {
  setPrivateResponseHeaders(res);
  return res.status(200).json({
    success: true,
    data: req.swiggyOAuthSession.getStatus(),
  });
};

export const getSwiggyAddressesController = async (req, res, next) => {
  try {
    const page = addressPageSchema.parse(req.query.page ?? 1);
    const client = req.swiggyOAuthSession.createClient();
    if (!client) {
      const error = new Error('Connect restaurant search before requesting saved locations');
      error.statusCode = 401;
      throw error;
    }

    const result = await client.getAddresses(page);
    const selectedAddressId = req.swiggyOAuthSession.getSelectedAddressId();
    const addresses = req.swiggyOAuthSession.rememberAddresses(result.addresses || [])
      .map((address) => ({
        ...address,
        selected: address.id === selectedAddressId,
      }));
    setPrivateResponseHeaders(res);
    return res.status(200).json({
      success: true,
      data: {
        addresses,
        pagination: result.pagination || null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new Error('Invalid Swiggy address page');
      validationError.statusCode = 400;
      validationError.details = error.flatten();
      return next(validationError);
    }
    return next(error);
  }
};

export const selectSwiggyAddressController = (req, res, next) => {
  setPrivateResponseHeaders(res);
  try {
    const { addressId } = selectAddressSchema.parse(req.body);
    if (!req.swiggyOAuthSession.createClient()) {
      const error = new Error('Connect restaurant search before selecting a saved location');
      error.statusCode = 401;
      throw error;
    }
    req.swiggyOAuthSession.selectAddress(addressId);
    setPrivateResponseHeaders(res);
    return res.status(200).json({
      success: true,
      data: { selectedAddress: true },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new Error('Invalid Swiggy address selection');
      validationError.statusCode = 400;
      return next(validationError);
    }
    if (error.statusCode === 401) return next(error);
    const selectionError = new Error('Select a saved location from the authenticated location list');
    selectionError.statusCode = 400;
    return next(selectionError);
  }
};

const getSelectedAddressClient = (session, addressId) => {
  const client = session.createClient();
  if (!client) {
    const error = new Error('Restaurant search is not connected or has expired; authorize again');
    error.statusCode = 401;
    throw error;
  }

  const selectedAddressId = session.getSelectedAddressId();
  if (!selectedAddressId) {
    const error = new Error('Select a saved location before searching nearby restaurants');
    error.statusCode = 409;
    throw error;
  }
  if (addressId !== selectedAddressId) {
    const error = new Error('The selected location does not match the active search area');
    error.statusCode = 400;
    throw error;
  }
  return client;
};

const forwardSwiggyToolError = (error, operation, next) => {
  if ([401, 419].includes(error.statusCode)) {
    const authError = new Error('Swiggy authorization expired or was revoked; authorize again');
    authError.statusCode = 401;
    return next(authError);
  }
  if (error.statusCode === 403) {
    const accessError = new Error('Swiggy access is not enabled for this tool or environment');
    accessError.statusCode = 403;
    return next(accessError);
  }

  logger.warn('Swiggy Food MCP request failed', {
    operation,
    statusCode: Number.isInteger(error.statusCode) ? error.statusCode : undefined,
  });
  const upstreamError = new Error('Restaurant search could not be completed by the catalogue provider');
  upstreamError.statusCode = error.statusCode === 429 ? 429 : 502;
  return next(upstreamError);
};

const normalizeSearchRestaurant = (restaurant) => ({
  id: restaurant.id,
  canonicalRestaurantId: `swiggy:${restaurant.id}`,
  restaurantId: `swiggy:${restaurant.id}`,
  providerRestaurantId: restaurant.id,
  provider: 'swiggy',
  providerIds: { swiggy: restaurant.id },
  name: restaurant.name,
  ...(typeof restaurant.areaName === 'string' ? { location: restaurant.areaName } : {}),
  ...(typeof restaurant.address === 'string' ? { address: restaurant.address } : {}),
  ...(typeof restaurant.phone === 'string' ? { phone: restaurant.phone } : {}),
  ...(typeof restaurant.latitude === 'number' ? { latitude: restaurant.latitude } : {}),
  ...(typeof restaurant.longitude === 'number' ? { longitude: restaurant.longitude } : {}),
  ...(Array.isArray(restaurant.cuisines) ? { cuisines: restaurant.cuisines } : {}),
  ...(typeof restaurant.avgRating === 'number' ? { rating: restaurant.avgRating } : {}),
  ...(typeof restaurant.totalRatings === 'string' ? { totalRatings: restaurant.totalRatings } : {}),
  ...(typeof restaurant.costForTwo === 'string' ? { costForTwo: restaurant.costForTwo } : {}),
  ...(typeof restaurant.description === 'string' ? { description: restaurant.description } : {}),
  ...(typeof restaurant.category === 'string' ? { category: restaurant.category } : {}),
  ...(typeof restaurant.imageUrl === 'string' ? { imageUrl: restaurant.imageUrl } : {}),
  ...(typeof restaurant.areaName === 'string' ? { areaName: restaurant.areaName } : {}),
  ...(typeof restaurant.distanceKm === 'number' ? { distanceKm: restaurant.distanceKm } : {}),
  ...(typeof restaurant.availabilityStatus === 'string'
    ? { availabilityStatus: restaurant.availabilityStatus }
    : {}),
  ...(typeof restaurant.nextOpenTime === 'string' ? { nextOpenTime: restaurant.nextOpenTime } : {}),
});

export const searchSwiggyRestaurantsController = async (req, res, next) => {
  setPrivateResponseHeaders(res);
  let input;
  try {
    input = restaurantSearchSchema.parse(req.body);
    const client = getSelectedAddressClient(req.swiggyOAuthSession, input.addressId);
    const result = await client.searchRestaurants(input);
    if (!Array.isArray(result?.restaurants)) {
      throw new Error('Swiggy returned an invalid restaurant search result');
    }

    const restaurants = result.restaurants
      .filter((restaurant) => (
        typeof restaurant?.id === 'string'
        && restaurant.id.length > 0
        && typeof restaurant.name === 'string'
        && restaurant.name.length > 0
      ))
      .map(normalizeSearchRestaurant);
    setPrivateResponseHeaders(res);
    return res.status(200).json({
      success: true,
      data: {
        provider: 'swiggy',
        restaurants,
        ...(result.nextOffset !== undefined ? { nextOffset: result.nextOffset } : {}),
        ...(typeof result.totalRestaurants === 'number' ? { totalRestaurants: result.totalRestaurants } : {}),
        ...(typeof result.hasMore === 'boolean' ? { hasMore: result.hasMore } : {}),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new Error('Invalid Swiggy restaurant search request');
      validationError.statusCode = 400;
      return next(validationError);
    }
    if ([400, 401, 409].includes(error.statusCode)) return next(error);
    return forwardSwiggyToolError(error, 'search_restaurants', next);
  }
};

export const disconnectSwiggyController = async (req, res, next) => {
  try {
    await req.swiggyOAuthSession.logout();
    swiggyOAuthSessionStore.remove(req.swiggyOAuthSessionId);
    clearSwiggyOAuthSessionCookie(res, req.secure);
    setPrivateResponseHeaders(res);
    return res.status(200).json({
      success: true,
      data: { connected: false },
    });
  } catch (error) {
    return next(error);
  }
};

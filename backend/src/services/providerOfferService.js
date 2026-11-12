import { logger } from '../config/logger.js';
import { createEazyDinerProvider } from '../providers/eazyDinerProvider.js';
import { createProviderResult } from '../providers/providerResult.js';
import { createSwiggyProvider } from '../providers/swiggyProvider.js';
import { createZomatoProvider } from '../providers/zomatoProvider.js';

const createProviders = ({ swiggySession, userLocation } = {}) => [
  createSwiggyProvider({ session: swiggySession, userLocation }),
  createZomatoProvider(),
  createEazyDinerProvider(),
];

export const getProviderOffers = async (restaurant, context = {}) => {
  const providers = createProviders(context);
  const settled = await Promise.allSettled(providers.map((provider) => provider.getOffers(restaurant)));

  return settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    const provider = providers[index].provider;
    logger.warn('Restaurant offer provider lookup failed', {
      provider,
      statusCode: Number.isInteger(result.reason?.statusCode) ? result.reason.statusCode : undefined,
    });
    const message = provider === 'swiggy_dineout' && result.reason?.statusCode === 403
      ? 'Swiggy Dineout access is not enabled for this account or environment.'
      : provider === 'swiggy_dineout' && [401, 419].includes(result.reason?.statusCode)
        ? 'Swiggy authorization expired or was revoked; reconnect Swiggy to check Dineout offers.'
        : 'The provider offer lookup could not be completed';
    return createProviderResult(
      provider,
      'error',
      [],
      message,
    );
  });
};

export const attachProviderOffers = async (restaurant, context = {}) => {
  const providerResults = await getProviderOffers(restaurant, context);
  const offers = providerResults.flatMap((result) => result.offers);

  return {
    ...restaurant,
    offers,
    providerStatuses: providerResults.map(({ provider, status, message, providerRestaurantId }) => ({
      provider,
      status,
      ...(message ? { message } : {}),
      ...(providerRestaurantId ? { providerRestaurantId } : {}),
    })),
  };
};

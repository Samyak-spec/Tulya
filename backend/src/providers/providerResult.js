import { providerResultSchema } from './offerSchema.js';

export const createProviderResult = (provider, status, offers = [], message, providerRestaurantId) =>
  providerResultSchema.parse({
    provider,
    status,
    offers,
    ...(message ? { message } : {}),
    ...(providerRestaurantId ? { providerRestaurantId } : {}),
  });

export const createUnavailableProvider = (provider, message = 'Authorized provider access is not configured') => ({
  provider,
  async getOffers() {
    return createProviderResult(provider, 'unavailable', [], message);
  },
});

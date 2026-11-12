import { normalizeOffer } from './offerSchema.js';
import { createProviderResult, createUnavailableProvider } from './providerResult.js';
import { matchProviderRestaurant } from './restaurantMatching.js';

const getOffers = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.offers)) return payload.offers;
  if (Array.isArray(payload?.data?.offers)) return payload.data.offers;
  return [];
};

const hasComparablePrices = (offer) => {
  const offerType = offer.offerType;
  const original = offer.originalPrice ?? offer.original_price ?? offer.originalAmount;
  const discount = offer.discount ?? offer.discount_amount ?? offer.discountAmount;
  const final = offer.finalPrice ?? offer.final_price ?? offer.effectivePrice ?? offer.finalAmount;
  const offerText = offer.offerText ?? offer.title ?? offer.description;
  return ['dine-in', 'table-booking'].includes(offerType)
    && [original, discount, final].every((amount) => (
    amount !== null && amount !== undefined && amount !== '' && Number.isFinite(Number(amount))
  ))
    && typeof offerText === 'string' && offerText.trim().length > 0;
};

export const createAuthorizedPartnerProvider = (provider, getAuthorizedOffers) => {
  if (typeof getAuthorizedOffers !== 'function') {
    return createUnavailableProvider(provider, `Authorized ${provider} API or partner access is not configured`);
  }

  return {
    provider,
    async getOffers(restaurant) {
      const payload = await getAuthorizedOffers(restaurant);
      const providerRestaurant = payload?.restaurant ?? payload?.data?.restaurant;
      if (!providerRestaurant || !matchProviderRestaurant(restaurant, providerRestaurant, provider).matched) {
        return createProviderResult(
          provider,
          'unavailable',
          [],
          `${provider} restaurant could not be safely matched`,
        );
      }

      const offers = getOffers(payload)
        .filter(hasComparablePrices)
        .map((offer) => normalizeOffer(provider, restaurant.id, {
          ...offer,
          providerRestaurantId: providerRestaurant?.providerIds?.[provider]
            || providerRestaurant?.id
            || null,
        }, { isVerified: true }));
      return createProviderResult(
        provider,
        offers.length > 0 ? 'verified' : 'unavailable',
        offers,
        offers.length > 0 ? undefined : `No price-comparable ${provider} offers were returned`,
      );
    },
  };
};

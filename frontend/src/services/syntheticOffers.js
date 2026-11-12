import { findManualEnrichment } from './manualEnrichment';

// Temporary fallback data. Remove once real provider offers are available.
const SYNTHETIC_PROVIDERS = [
  { key: 'swiggy', label: 'Swiggy' },
  { key: 'district', label: 'District' },
  { key: 'eazydiner', label: 'EazyDiner' },
];
const SYNTHETIC_PERCENTS = [10, 15, 20, 25];

const hashString = (value) => [...value].reduce(
  (hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0,
  7,
);

const providerKeyOf = (offer) => String(offer.providerKey || offer.provider || '')
  .toLowerCase()
  .replace(/[\s_-]*dineout$/, '');

export const isProtectedRestaurant = (restaurant) => Boolean(findManualEnrichment(restaurant));

// Returns at most one temporary offer for each provider that has no real offer.
export const createSyntheticFallbackOffers = (restaurant, realOffers = [], linkSources = []) => {
  if (!restaurant || isProtectedRestaurant(restaurant)) return [];
  const covered = new Set(realOffers.map(providerKeyOf));
  return SYNTHETIC_PROVIDERS
    .filter(({ key }) => !covered.has(key))
    .map(({ key, label }) => {
      const percent = SYNTHETIC_PERCENTS[
        hashString(`${restaurant.id || restaurant.name}:${key}`) % SYNTHETIC_PERCENTS.length
      ];
      const deepLink = linkSources.find((offer) => providerKeyOf(offer) === key && offer.deepLink)?.deepLink
        || null;
      return {
        provider: label,
        providerKey: key,
        offerType: 'walk-in',
        title: `${percent}% OFF`,
        offerText: `${percent}% OFF`,
        code: 'Dine-in offer',
        discountPercent: percent,
        discount: null,
        finalPrice: null,
        originalPrice: null,
        deepLink,
        isManual: true,
        isTemporary: true,
        isVerified: false,
      };
    });
};

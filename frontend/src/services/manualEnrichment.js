import { demoRestaurants } from '../data/demoRestaurants';
import { normalizeSearchText } from './demoRestaurantSearch';
import { restaurantMatchScore } from './restaurantCatalog';

const providerLabels = { swiggy: 'Swiggy', district: 'District', eazydiner: 'EazyDiner' };
const nonPrimaryOfferPattern = /cashback|bank|card|wallet|coupon|delivery|payment/i;
const manualSearchAliases = {
  'the-basil-cafe-restro': ['basil', 'basil cafe', 'basil cafe restro', 'basil cafe restaurant'],
  'restaurant-trident-bhubaneswar': [
    'restaurant trident',
    'restaurant trident bhubaneswar',
    'trident bhubaneswar',
  ],
  'nakli-dhaba-mayfair-lagoon': ['nakli dhaba', 'nakli dhaba mayfair', 'nakli dhaba mayfair lagoon'],
  'tea-pot-mayfair-lagoon': ['tea pot', 'tea pot mayfair', 'tea pot mayfair lagoon'],
  'barbeque-nation-triplex-mall': [
    'barbeque nation',
    'barbecue nation',
    'bbq nation',
    'barbeque nation triplex mall',
    'bbq nation triplex mall',
  ],
  'lyfe-kitchen-lyfe-hotel': ['lyfe', 'lyfe kitchen', 'lyfe kitchen lyfe hotel'],
  'terra-rosso': ['terra rosso'],
  'baron-baroness-mayfair-lagoon': [
    'baron baroness',
    'baron and baroness',
    'baron baroness mayfair',
    'baron and baroness mayfair',
  ],
  birch: ['birch', 'birch patia'],
  'blanco-kitchen-terrace': ['blanco', 'blanco kitchen', 'blanco kitchen terrace'],
};

const manualRecordKey = (record) => record.canonicalRestaurantId.replace(/^tulya:/, '');

export const findManualSearchMatch = (query, records = demoRestaurants) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  const queryTokens = new Set(normalizedQuery.split(' '));

  return records.find((record) => {
    const aliases = [
      record.name,
      ...(manualSearchAliases[manualRecordKey(record)] || []),
    ];
    return aliases.some((alias) => {
      const aliasTokens = normalizeSearchText(alias).split(' ').filter(Boolean);
      return aliasTokens.length > 0 && aliasTokens.every((token) => queryTokens.has(token));
    });
  }) || null;
};

export const findManualEnrichment = (restaurant, records = demoRestaurants) => {
  if (!restaurant) return null;
  const swiggyId = String(restaurant.providerRestaurantId || restaurant.providerIds?.swiggy || '');
  if (swiggyId) {
    const byId = records.find((record) => record.providerIds?.swiggy === swiggyId);
    if (byId) return byId;
  }
  const best = records
    .map((record) => ({ record, score: restaurantMatchScore(restaurant, record) }))
    .sort((left, right) => right.score - left.score)[0];
  return best?.score ? best.record : null;
};

export const isPrimaryDineInOffer = (offer) => {
  const searchableText = [
    offer.title,
    offer.offerText,
    offer.description,
    offer.code,
    ...(Array.isArray(offer.terms) ? offer.terms : [offer.terms]),
    ...(Array.isArray(offer.eligibility) ? offer.eligibility : [offer.eligibility]),
  ].filter(Boolean).join(' ');
  return !nonPrimaryOfferPattern.test(searchableText);
};

const providerIdFromOffer = (offer) => String(offer.provider || '')
  .toLowerCase()
  .replace(/[\s_-]*dineout$/, '');

export const getPrimaryLiveOffers = (offers = [], manualEntries = []) => offers
  .filter((offer) => (
    offer.isVerified === true
    && ['dine-in', 'table-booking'].includes(offer.offerType)
    && isPrimaryDineInOffer(offer)
  ))
  .map((offer) => {
    const manualProvider = manualEntries.find((entry) => (
      entry.providerId === providerIdFromOffer(offer)
    ));
    return manualProvider?.deepLink
      ? { ...offer, deepLink: manualProvider.deepLink }
      : offer;
  });

export const mergeProviderOffers = (liveOffers = [], manualEntries = []) => [
  ...getPrimaryLiveOffers(liveOffers, manualEntries),
  ...manualEntries.flatMap((entry) => entry.offers),
];

const offerProviderKey = (offer) => offer.providerKey || providerIdFromOffer(offer);

const offerPercent = (offer) => {
  if (Number.isFinite(Number(offer.discountPercent)) && offer.discountPercent !== null) {
    return Number(offer.discountPercent);
  }
  const original = Number(offer.originalPrice);
  const discount = Number(offer.discount);
  return original > 0 && Number.isFinite(discount) ? (discount / original) * 100 : 0;
};

const offerSpecificity = (offer) => {
  const descriptiveText = [
    offer.title,
    offer.offerText,
    offer.terms,
    offer.validity,
    ...(Array.isArray(offer.eligibility) ? offer.eligibility : [offer.eligibility]),
  ].filter(Boolean).join(' ');
  const qualifiers = descriptiveText.match(
    /\b(pre.?book(?:ing)?|reservation|required|only|minimum|weekday|weekend|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|valid on|up to)\b/gi,
  ) || [];
  return qualifiers.length + (offer.bookingRequired === true ? 1 : 0);
};

// Higher percentage first, then broader applicability, then simpler terms.
export const compareOffers = (left, right) => (
  offerPercent(right) - offerPercent(left)
  || offerSpecificity(left) - offerSpecificity(right)
  || String(left.title || left.offerText || '').length
    - String(right.title || right.offerText || '').length
);

export const selectBestOfferPerProvider = (offers = []) => {
  const best = new Map();
  offers
    .filter((offer) => offer.isVerified === true && !offer.isTemporary && isPrimaryDineInOffer(offer))
    .forEach((offer) => {
      const key = offerProviderKey(offer);
      const current = best.get(key);
      if (!current || compareOffers(offer, current) < 0) best.set(key, offer);
    });
  return [...best.values()];
};

export const getBestLinkedOffer = (offers = []) => offers
  .filter((offer) => (
    offer.isVerified === true
    && !offer.isTemporary
    && Boolean(offer.deepLink)
    && isPrimaryDineInOffer(offer)
  ))
  .sort(compareOffers)[0] || null;

export const getProvidersWithoutOffers = (liveOffers = [], manualEntries = []) => {
  const providersWithLiveOffers = new Set(
    getPrimaryLiveOffers(liveOffers).map(providerIdFromOffer),
  );
  return manualEntries.filter((entry) => (
    entry.deepLink
    && !providersWithLiveOffers.has(entry.providerId)
    && entry.offers.length === 0
  ));
};

// Manual records are additive: each provider keeps its own offers and exact deep link.
export const getManualProviderEntries = (record) => {
  if (!record) return [];
  return Object.entries(record.providers || {})
    .map(([providerId, data]) => ({
      providerId,
      providerName: providerLabels[providerId] || providerId,
      deepLink: data.deepLink || null,
      rating: data.rating ?? null,
      offers: (record.offers || [])
        .filter((offer) => offer.provider === providerId && isPrimaryDineInOffer(offer))
        .map((offer) => ({
          ...offer,
          provider: providerLabels[providerId] || providerId,
          providerKey: providerId,
          deepLink: data.deepLink || null,
          discount: null,
          finalPrice: null,
          originalPrice: null,
          isVerified: true,
          isManual: true,
        })),
    }))
    .filter((entry) => entry.deepLink || entry.offers.length > 0);
};

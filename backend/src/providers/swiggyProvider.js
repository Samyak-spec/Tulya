import { logger } from '../config/logger.js';
import { createProviderResult } from './providerResult.js';
import { normalizeOffer } from './offerSchema.js';
import { matchProviderRestaurants } from './restaurantMatching.js';

const unwrapData = (payload) => {
  let data = payload?.data ?? payload;
  while (data?.statusCode !== undefined && data.data) {
    data = data.data;
  }
  return data;
};

const unwrapSearchData = (payload) => {
  let data = unwrapData(payload);
  for (let depth = 0; depth < 3 && !Array.isArray(data?.restaurants) && data?.data; depth += 1) {
    data = unwrapData(data.data);
  }
  return data;
};

const indiaDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);

const slotHasAvailability = (slot) => {
  return Number(slot.availableInventory) > 0;
};

const dealHasAvailability = (deal) => {
  const inventory = deal.availableInventory ?? deal.availableInventoryCount;
  return inventory === undefined || Number(inventory) > 0;
};

const toStringList = (value) => {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
};

const toDineoutOffer = (restaurant, providerRestaurantId, deal, defaultType, eligibility = []) => {
  const offerCategory = String(deal.offerCategory || '').toLowerCase();
  const offerKind = [
    deal.offerType,
    deal.offerCategory,
    deal.category,
    deal.dealType,
    deal.serviceType,
  ].filter((value) => typeof value === 'string').join(' ').toLowerCase();
  if (/\b(delivery|cod|food[\s_-]*order|online[\s_-]*order)\b/.test(offerKind)) return null;

  const title = deal.title || deal.offerTitle || deal.name || deal.description;
  if (typeof title !== 'string' || !title.trim()) return null;

  const description = typeof deal.description === 'string' && deal.description !== title
    ? deal.description.trim()
    : '';
  const discountPercentage = typeof deal.discountPercentage === 'number'
    ? deal.discountPercentage
    : null;
  const offerText = [
    discountPercentage !== null && discountPercentage > 0
      ? `${discountPercentage}% discount`
      : '',
    title.trim(),
    description,
  ].filter(Boolean).join(' — ');
  const explicitType = ['dine-in', 'table-booking'].includes(deal.offerType) ? deal.offerType : null;
  const offerType = explicitType || (offerCategory === 'walkin' ? 'dine-in' : defaultType);

  const providerOfferId = deal.id ?? deal.ticketId ?? deal.itemId;
  const providerDetails = Object.fromEntries(Object.entries({
    title: deal.title ?? deal.offerTitle ?? deal.name,
    description: deal.description,
    discountPercentage: deal.discountPercentage,
    discountAmount: deal.discountAmount,
    originalPrice: deal.originalPrice,
    finalPrice: deal.finalPrice,
    minimumSpend: deal.minimumSpend,
    minSpend: deal.minSpend,
    minimumBillAmount: deal.minimumBillAmount,
    minBillAmount: deal.minBillAmount,
    terms: deal.terms,
    termsAndConditions: deal.termsAndConditions,
    eligibility: deal.eligibility,
    validity: deal.validity,
    validFrom: deal.validFrom,
    validUntil: deal.validUntil,
    validTill: deal.validTill,
    deepLink: deal.deepLink,
    url: deal.url,
    timestamp: deal.timestamp,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    coverCharge: deal.coverCharge,
    bookingPrice: deal.bookingPrice,
    displayFee: deal.displayFee,
    itemId: deal.itemId,
    ticketId: deal.ticketId,
    slotId: deal.slotId,
    slotGroupName: deal.slotGroupName,
    offerCategory: deal.offerCategory,
    offerType: deal.offerType,
    availableInventory: deal.availableInventory ?? deal.availableInventoryCount,
    date: eligibility.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    displayTime: eligibility.find((value) => /^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(value)),
  }).filter(([, value]) => value !== undefined && value !== null));

  return normalizeOffer('swiggy_dineout', restaurant.id, {
    providerRestaurantId,
    providerOfferId,
    providerDetails,
    offerType,
    originalPrice: deal.originalPrice ?? null,
    discount: deal.discountAmount ?? deal.discount ?? null,
    finalPrice: deal.finalPrice ?? null,
    offerText,
    code: deal.code ?? deal.couponCode ?? null,
    terms: toStringList(deal.terms ?? deal.termsAndConditions),
    eligibility: [
      ...toStringList(deal.eligibility),
      ...eligibility,
      ...(typeof deal.slotGroupName === 'string' ? [deal.slotGroupName] : []),
    ],
    deepLink: deal.deepLink ?? deal.url ?? null,
  }, { isVerified: true });
};

const getRows = (value) => Array.isArray(value) ? value : [];

export const createSwiggyProvider = ({ session, userLocation } = {}) => ({
  provider: 'swiggy_dineout',

  async getOffers(restaurant) {
    const client = session?.createDineoutClient?.();
    if (!client) {
      return createProviderResult(
        'swiggy_dineout',
        'unavailable',
        [],
        'Connect Swiggy to check official Dineout offers.',
      );
    }
    if (
      !Number.isFinite(userLocation?.latitude)
      || !Number.isFinite(userLocation?.longitude)
      || userLocation.latitude < -90
      || userLocation.latitude > 90
      || userLocation.longitude < -180
      || userLocation.longitude > 180
    ) {
      return createProviderResult(
        'swiggy_dineout',
        'unavailable',
        [],
        'Allow Tulya to use your browser location to search Swiggy Dineout.',
      );
    }

    const searchPayload = await client.searchRestaurants({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      query: restaurant.name,
    });
    const searchData = unwrapSearchData(searchPayload);
    const matches = matchProviderRestaurants(
      restaurant,
      getRows(searchData.restaurants).map((candidate) => ({
        ...candidate,
        id: String(candidate.id ?? candidate.restaurantId ?? ''),
        providerIds: {
          ...candidate.providerIds,
          swiggyDineout: String(candidate.id ?? candidate.restaurantId ?? ''),
        },
        address: [candidate.address, candidate.locality, candidate.area]
          .filter((value) => typeof value === 'string' && value)
          .join(', '),
        areaName: candidate.areaName || candidate.locality || candidate.area,
      })),
      'swiggy_dineout',
    );
    const matchedRestaurant = matches[0]?.candidate;
    const ambiguousMatch = matches.length > 1
      && matches[0].score - matches[1].score < 0.08;
    if (!matchedRestaurant?.id) {
      return createProviderResult(
        'swiggy_dineout',
        'unavailable',
        [],
        'Swiggy Dineout returned no restaurant with sufficient name and location match evidence.',
      );
    }
    if (ambiguousMatch) {
      return createProviderResult(
        'swiggy_dineout',
        'unavailable',
        [],
        'Swiggy Dineout returned multiple equally matched restaurants.',
      );
    }

    const location = {
      restaurantId: matchedRestaurant.id,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    };
    const detailsPayload = await client.getRestaurantDetails(location);
    let slotsPayload;
    let slotsError;
    try {
      slotsPayload = await client.getAvailableSlots({ ...location, date: indiaDate(new Date()) });
    } catch (error) {
      if ([401, 419].includes(error.statusCode)) throw error;
      slotsError = error;
      logger.warn('Swiggy Dineout live slots lookup failed', {
        statusCode: Number.isInteger(error.statusCode) ? error.statusCode : undefined,
      });
    }
    const detailsData = unwrapData(detailsPayload);
    const restaurantDetails = detailsData.restaurant || detailsData;
    const slotsData = slotsPayload ? unwrapData(slotsPayload) : {};
    const detailsDeals = [
      ...getRows(restaurantDetails.offers),
      ...getRows(restaurantDetails.availableDeals),
      ...getRows(restaurantDetails.deals),
      ...getRows(detailsData.offers),
      ...getRows(detailsData.availableDeals),
      ...getRows(detailsData.deals),
    ]
      .filter(dealHasAvailability)
      .map((deal) => toDineoutOffer(restaurant, matchedRestaurant.id, deal, 'table-booking'))
      .filter(Boolean);
    const slotDeals = getRows(slotsData.slots)
      .filter(slotHasAvailability)
      .flatMap((slot) => getRows(slot.deals)
        .filter(dealHasAvailability)
        .map((deal) => toDineoutOffer(
          restaurant,
          matchedRestaurant.id,
          deal,
          'table-booking',
          [slot.dateStr, slot.slotGroupName, slot.displayTime].filter(Boolean),
        )))
      .filter(Boolean);
    const offersByKey = new Map();
    [...detailsDeals, ...slotDeals].forEach((offer) => {
      const existing = [...offersByKey.values()].find((candidate) => (
        candidate.offerText === offer.offerText
        && (!candidate.providerOfferId
          || !offer.providerOfferId
          || candidate.providerOfferId === offer.providerOfferId)
      ));
      if (existing) {
        existing.eligibility = [...new Set([...existing.eligibility, ...offer.eligibility])];
      } else {
        const key = offer.providerOfferId
          ? `id:${offer.providerOfferId}`
          : `${offer.offerType}|${offer.offerText}`;
        offersByKey.set(key, offer);
      }
    });
    const offers = [...offersByKey.values()];

    const message = slotsError
      ? 'Current Dineout offers were retrieved, but live table availability could not be checked.'
      : undefined;
    return offers.length > 0
      ? createProviderResult('swiggy_dineout', 'verified', offers, message, matchedRestaurant.id)
      : createProviderResult(
        'swiggy_dineout',
        'unavailable',
        [],
        'Swiggy Dineout returned no verified dine-in or table-booking deals for this restaurant.',
        matchedRestaurant.id,
      );
  },
});

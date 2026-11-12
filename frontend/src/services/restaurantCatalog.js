import { demoRestaurants, demoOfferList } from '../data/demoRestaurants';
import { normalizeSearchText, parseDemoSearchIntent, searchDemoRestaurants } from './demoRestaurantSearch';

const nameTokens = (name) => normalizeSearchText(name)
  .split(' ')
  .filter((token) => token && ![
    'the', 'and', 'restaurant', 'restaurants', 'restro', 'resto', 'cafe', 'hotel', 'bar', 'bhubaneswar',
  ].includes(token));

export const restaurantMatchScore = (catalogueRestaurant, manualRestaurant) => {
  const catalogueTokens = nameTokens(catalogueRestaurant.name);
  const manualTokens = nameTokens(manualRestaurant.name);
  if (!catalogueTokens.length || !manualTokens.length) return 0;
  const overlap = catalogueTokens.filter((token) => manualTokens.includes(token)).length;
  const nameScore = overlap / Math.min(catalogueTokens.length, manualTokens.length);
  const catalogueNameCoverage = overlap / catalogueTokens.length;
  const compact = (value) => normalizeSearchText(value).replace(/\s+/g, '');
  const manualArea = compact(manualRestaurant.location);
  const catalogueAddress = compact([
    catalogueRestaurant.location,
    catalogueRestaurant.address,
  ].filter(Boolean).join(' '));
  const areaMatches = manualArea && catalogueAddress.includes(manualArea);
  if (manualArea && !areaMatches) return 0;
  const nameMatches = nameScore >= 0.75 || (overlap >= 2 && catalogueNameCoverage >= 0.8);
  return nameMatches && (areaMatches || nameScore >= 0.9) ? nameScore : 0;
};

const mergeRestaurant = (catalogueRestaurant, manualRestaurant) => {
  if (!manualRestaurant) {
    return {
      ...catalogueRestaurant,
      catalogueSearchMatch: true,
      canonicalRestaurantId: catalogueRestaurant.canonicalRestaurantId || catalogueRestaurant.id,
      canonicalRating: null,
      catalogueRating: catalogueRestaurant.rating ?? null,
      providerRatings: {
        googlePlaces: catalogueRestaurant.rating ?? null,
      },
      providerIds: {
        googlePlaces: catalogueRestaurant.providerId || null,
      },
      dietary: catalogueRestaurant.dietary || { pureVeg: null, vegetarianFriendly: null },
      category: catalogueRestaurant.category || null,
      providers: {},
      offers: [],
      deepLinks: {},
      menu: null,
      manuallyEnriched: false,
    };
  }

  return {
    ...catalogueRestaurant,
    ...manualRestaurant,
    catalogueSearchMatch: true,
    id: manualRestaurant.canonicalRestaurantId,
    canonicalRestaurantId: manualRestaurant.canonicalRestaurantId,
    name: manualRestaurant.name,
    image: catalogueRestaurant.image || manualRestaurant.image || null,
    location: catalogueRestaurant.location || manualRestaurant.location || null,
    address: catalogueRestaurant.address || manualRestaurant.address || null,
    cuisine: catalogueRestaurant.cuisine || manualRestaurant.cuisine || null,
    cuisines: catalogueRestaurant.cuisines?.length
      ? catalogueRestaurant.cuisines
      : manualRestaurant.cuisines || [],
    catalogueRating: catalogueRestaurant.rating ?? null,
    providerRatings: {
      ...manualRestaurant.providerRatings,
      googlePlaces: catalogueRestaurant.rating ?? null,
    },
    providerIds: {
      ...manualRestaurant.providerIds,
      googlePlaces: catalogueRestaurant.providerId || null,
    },
    providers: manualRestaurant.providers,
    offers: demoOfferList(manualRestaurant),
    manuallyEnriched: true,
  };
};

export const mergeRestaurantCatalogue = (
  liveRestaurants = [],
  query = '',
  selectedArea = '',
  userLocation = null,
) => {
  const merged = liveRestaurants.map((catalogueRestaurant) => {
    const matchedManualRestaurant = demoRestaurants
      .map((manualRestaurant) => ({
        manualRestaurant,
        score: restaurantMatchScore(catalogueRestaurant, manualRestaurant),
      }))
      .sort((left, right) => right.score - left.score)[0];
    return mergeRestaurant(
      catalogueRestaurant,
      matchedManualRestaurant?.score ? matchedManualRestaurant.manualRestaurant : null,
    );
  });
  const intent = parseDemoSearchIntent(query, selectedArea);
  const shouldIncludeManual = Boolean(
    query.trim()
    && (intent.terms.length > 0 || intent.dietary || intent.category || intent.location)
  );
  const manualMatches = shouldIncludeManual
    ? searchDemoRestaurants(query, selectedArea, demoRestaurants, userLocation)
    : [];
  const mergedIds = new Set(merged.map((restaurant) => restaurant.canonicalRestaurantId));
  manualMatches.forEach((restaurant) => {
    if (!mergedIds.has(restaurant.canonicalRestaurantId)) {
      merged.push({
        ...restaurant,
        id: restaurant.canonicalRestaurantId,
        manuallyEnriched: true,
      });
      mergedIds.add(restaurant.canonicalRestaurantId);
    }
  });

  return searchDemoRestaurants(query, selectedArea, merged, userLocation);
};

export const rankRestaurants = (restaurants, { query = '' } = {}) => {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  const matches = (restaurant) => terms.filter((term) => (
    nameTokens(restaurant.name).some((candidate) => candidate.includes(term) || term.includes(candidate))
  )).length;
  const completeness = (restaurant) => [
    restaurant.image,
    restaurant.address,
    restaurant.cuisines?.length,
    restaurant.rating ?? restaurant.canonicalRating,
    restaurant.providerIds && Object.keys(restaurant.providerIds).length,
  ].filter(Boolean).length;
  const offerValue = (restaurant) => (restaurant.offers || [])
    .reduce((highest, offer) => Math.max(highest, offer.discountPercent || offer.discount || 0), 0);

  return [...restaurants].sort((left, right) => {
    const distanceDelta = (left.distance ?? Number.POSITIVE_INFINITY)
      - (right.distance ?? Number.POSITIVE_INFINITY);
    return distanceDelta
      || matches(right) - matches(left)
      || (right.rating ?? right.canonicalRating ?? 0) - (left.rating ?? left.canonicalRating ?? 0)
      || completeness(right) - completeness(left)
      || offerValue(right) - offerValue(left)
      || left.name.localeCompare(right.name);
  });
};

export const mergeManualRestaurant = (restaurant) => mergeRestaurant(restaurant, restaurant);

const normalizeText = (value = '') => String(value)
  .normalize('NFKD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const getTokens = (value) => new Set(normalizeText(value).split(' ').filter(Boolean));

const tokenSimilarity = (left, right) => {
  const a = getTokens(left);
  const b = getTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.min(a.size, b.size);
};

const distanceKm = (left, right) => {
  if (![left?.latitude, left?.longitude, right?.latitude, right?.longitude].every(Number.isFinite)) {
    return null;
  }
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latDelta = radians(right.latitude - left.latitude);
  const lonDelta = radians(right.longitude - left.longitude);
  const value = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(lonDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const getAddress = (restaurant) => [
  restaurant.address,
  restaurant.location?.address,
  typeof restaurant.location === 'string' ? restaurant.location : '',
  restaurant.formattedAddress,
  restaurant.areaName,
  restaurant.locality,
  restaurant.area,
].filter((value) => typeof value === 'string' && value).join(' ');

const getName = (restaurant) => restaurant.name || restaurant.displayName || '';

const getProviderId = (restaurant, provider) => (
  restaurant.providerIds?.[provider]
  || restaurant[`${provider}RestaurantId`]
  || null
);

export const matchProviderRestaurant = (canonicalRestaurant, providerRestaurant, provider) => {
  const providerId = getProviderId(providerRestaurant, provider);
  const canonicalProviderId = getProviderId(canonicalRestaurant, provider);
  if (providerId && canonicalProviderId && providerId === canonicalProviderId) {
    return { matched: true, score: 1, reason: 'provider_id' };
  }

  const nameScore = tokenSimilarity(getName(canonicalRestaurant), getName(providerRestaurant));
  const addressScore = tokenSimilarity(getAddress(canonicalRestaurant), getAddress(providerRestaurant));
  const distance = distanceKm(canonicalRestaurant, providerRestaurant);

  if (distance !== null && distance <= 0.15 && nameScore >= 0.6) {
    return { matched: true, score: Math.min(0.99, 0.7 + nameScore * 0.2 + addressScore * 0.1), reason: 'name_and_proximity' };
  }
  if (nameScore >= 0.9 && addressScore >= 0.5) {
    return { matched: true, score: Math.min(0.95, 0.6 + nameScore * 0.2 + addressScore * 0.2), reason: 'name_and_address' };
  }

  return { matched: false, score: 0, reason: 'insufficient_match_evidence' };
};

export const matchProviderRestaurants = (canonicalRestaurant, providerRestaurants, provider) => (
  providerRestaurants
    .map((candidate) => ({
      candidate,
      ...matchProviderRestaurant(canonicalRestaurant, candidate, provider),
    }))
    .filter((match) => match.matched)
    .sort((left, right) => right.score - left.score)
);

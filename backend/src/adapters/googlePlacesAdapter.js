import { env } from '../config/env.js';

const GOOGLE_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const GOOGLE_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PHOTO_URL = 'https://places.googleapis.com/v1';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const MAX_SEARCH_RADIUS_METERS = 50000;
const MAX_RESULTS_PER_SEARCH = 20;
const EARTH_RADIUS_KM = 6371;
const PLACE_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.primaryTypeDisplayName',
  'places.primaryType',
  'places.types',
  'places.photos',
  'places.editorialSummary',
].join(',');

const radians = (degrees) => (degrees * Math.PI) / 180;

const distanceBetweenKm = (latitudeA, longitudeA, latitudeB, longitudeB) => {
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const searchCenters = ({ latitude, longitude, distance }) => {
  const offsetKm = distance / 2;
  const latitudeOffset = offsetKm / 111.195;
  const longitudeOffset = offsetKm / (111.195 * Math.max(Math.abs(Math.cos(radians(latitude))), 0.01));

  return [
    { latitude: latitude + latitudeOffset, longitude: longitude + longitudeOffset },
    { latitude: latitude + latitudeOffset, longitude: longitude - longitudeOffset },
    { latitude: latitude - latitudeOffset, longitude: longitude + longitudeOffset },
    { latitude: latitude - latitudeOffset, longitude: longitude - longitudeOffset },
  ];
};

const getText = (value) => value?.text || '';

const CUISINE_TYPES = {
  chinese_restaurant: 'Chinese',
  indian_restaurant: 'Indian',
  italian_restaurant: 'Italian',
  pizza_restaurant: 'Italian',
  thai_restaurant: 'Thai',
  japanese_restaurant: 'Japanese',
  sushi_restaurant: 'Japanese',
  mexican_restaurant: 'Mexican',
  american_restaurant: 'American',
  mediterranean_restaurant: 'Mediterranean',
  middle_eastern_restaurant: 'Middle Eastern',
  seafood_restaurant: 'Seafood',
  barbecue_restaurant: 'Barbecue',
  fast_food_restaurant: 'Fast food',
  vegetarian_restaurant: 'Vegetarian',
  vegan_restaurant: 'Vegan',
};

const deriveCuisines = (place) => {
  const fromTypes = [...new Set((place.types || [])
    .map((type) => CUISINE_TYPES[type])
    .filter(Boolean))];
  if (fromTypes.length) return fromTypes;
  const display = getText(place.primaryTypeDisplayName);
  return display && !/^restaurant$/i.test(display) ? [display] : [];
};

const deriveCategory = (place) => {
  const types = place.types || [];
  if (types.includes('cafe') || types.includes('coffee_shop')) return 'cafe';
  if (types.includes('bar') || types.includes('night_club')) return 'bar';
  if (types.includes('bakery')) return 'bakery';
  return place.primaryType === 'restaurant' || types.includes('restaurant') ? 'restaurant' : null;
};

const normalizeMatchText = (value) => (value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const matchTokens = (value) => normalizeMatchText(value)
  .split(/\s+/)
  .filter((token) => token && ![
    'the', 'and', 'restaurant', 'restaurants', 'restro', 'resto', 'cafe', 'hotel',
    'bar', 'bhubaneswar', 'odisha', 'india',
  ].includes(token));

const localityMatchTokens = (value) => normalizeMatchText(value)
  .split(/\s+/)
  .filter((token) => token && ![
    'the', 'and', 'restaurant', 'restaurants', 'restro', 'resto', 'cafe', 'hotel', 'bar',
  ].includes(token));

const placeAddressText = (place) => [
  place.formattedAddress,
  ...(place.addressComponents || []).map((component) => component.longText),
].filter(Boolean).join(' ');

const photoMatchScore = (place, target) => {
  const targetNameTokens = matchTokens(target.name);
  const candidateNameTokens = new Set(matchTokens(getText(place.displayName)));
  if (!targetNameTokens.length || !candidateNameTokens.size) return -1;
  const nameScore = targetNameTokens.filter((token) => candidateNameTokens.has(token)).length
    / targetNameTokens.length;
  if (nameScore < 0.75) return -1;

  const addressText = normalizeMatchText(placeAddressText(place));
  const localityTokens = localityMatchTokens(target.location);
  if (localityTokens.length && !localityTokens.every((token) => addressText.includes(token))) return -1;
  const addressTokens = matchTokens(target.address);
  const addressScore = addressTokens.length
    ? addressTokens.filter((token) => addressText.includes(token)).length / addressTokens.length
    : 0;
  return nameScore + addressScore * 0.25;
};

const normalizePlace = (place, origin = null) => {
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  const photo = place.photos?.[0];
  const photoAttributions = photo?.authorAttributions?.map((attribution) => ({
    displayName: attribution.displayName,
    uri: attribution.uri,
    photoUri: attribution.photoUri,
  })) || [];
  const cuisines = deriveCuisines(place);
  const cuisine = cuisines[0] || null;
  const location = place.addressComponents?.find((component) => (
    component.types?.includes('sublocality_level_1')
    || component.types?.includes('neighborhood')
  ))?.longText || null;

  return {
    id: `google-place-${place.id}`,
    providerId: place.id,
    providerIds: { googlePlaces: place.id },
    name: getText(place.displayName) || 'Restaurant',
    cuisine,
    cuisines,
    description: place.editorialSummary?.text || null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    priceLevel: place.priceLevel ?? null,
    priceRange: place.priceLevel ?? 'Price not listed',
    location,
    address: place.formattedAddress || null,
    distance: origin && latitude !== undefined && longitude !== undefined
      ? distanceBetweenKm(origin.latitude, origin.longitude, latitude, longitude)
      : null,
    image: photo?.name
      ? `/api/v1/restaurants/photos?name=${encodeURIComponent(photo.name)}`
      : null,
    photoAttributions,
    offers: [],
    menu: null,
    menuPreview: [],
    deliveryMode: null,
    category: deriveCategory(place),
    canonicalRestaurantId: `google:${place.id}`,
    dietary: {
      pureVeg: null,
      vegetarianFriendly: (place.types || []).some((type) => (
        type === 'vegetarian_restaurant' || type === 'vegan_restaurant'
      )) || null,
    },
    providerRatings: {},
    providers: {},
    deepLinks: {},
    source: 'restaurant_catalog',
  };
};

const fetchNearbyPlaces = async ({ apiKey, fetchImpl }, center, radiusMeters) => {
  const response = await fetchImpl(GOOGLE_NEARBY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACE_FIELDS,
    },
    body: JSON.stringify({
      includedTypes: ['restaurant'],
      maxResultCount: MAX_RESULTS_PER_SEARCH,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: center.latitude, longitude: center.longitude },
          radius: radiusMeters,
        },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const error = new Error('Google Places could not complete the nearby restaurant search');
    error.statusCode = response.status === 429 ? 503 : 502;
    throw error;
  }

  const data = await response.json();
  return data.places || [];
};

const fetchTextPlaces = async ({ apiKey, fetchImpl }, query, origin) => {
  const response = await fetchImpl(GOOGLE_TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACE_FIELDS,
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: MAX_RESULTS_PER_SEARCH,
      ...(origin ? {
        locationBias: {
          circle: {
            center: { latitude: origin.latitude, longitude: origin.longitude },
            radius: 15000,
          },
        },
      } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const error = new Error('Restaurant search could not be completed');
    error.statusCode = response.status === 429 ? 503 : 502;
    throw error;
  }

  const data = await response.json();
  return data.places || [];
};

const geocode = async ({ apiKey, fetchImpl }, params) => {
  const url = new URL(GOOGLE_GEOCODE_URL);
  url.searchParams.set('key', apiKey);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    const error = new Error('The selected location could not be resolved');
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error('The selected location could not be resolved');
    error.statusCode = response.status === 429 ? 503 : 502;
    throw error;
  }

  const data = await response.json();
  if (data.status !== 'OK' || !data.results?.length) {
    const error = new Error('The selected location could not be resolved');
    error.statusCode = 422;
    throw error;
  }
  return data.results[0];
};

export const createGooglePlacesAdapter = ({ apiKey, fetchImpl = fetch }) => {
  const configuration = { apiKey, fetchImpl };

  const adapter = {
    isConfigured: () => Boolean(apiKey),

    async findRestaurantPhoto({
      name,
      location,
      address,
      googlePlaceId,
      latitude,
      longitude,
    }) {
      if (!apiKey) {
        const error = new Error('Restaurant discovery is not configured');
        error.statusCode = 503;
        throw error;
      }

      if (googlePlaceId) {
        try {
          const place = await adapter.getPlaceDetails(googlePlaceId);
          if (place.image) {
            return {
              image: place.image,
              placeId: googlePlaceId,
              photoAttributions: place.photoAttributions,
            };
          }
        } catch {
          // Fall back to name/locality matching when the place ID lookup fails.
        }
      }
      const locality = [location, address, 'Bhubaneswar', 'Odisha', 'India']
        .filter(Boolean)
        .join(', ');
      const candidates = await fetchTextPlaces(
        configuration,
        `${name} restaurant in ${locality}`,
        Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
      );

      const match = candidates
        .map((place) => ({
          place,
          score: photoMatchScore(place, { name, location, address }),
        }))
        .filter(({ place, score }) => score >= 0.75 && place.photos?.[0]?.name)
        .map(({ place, score }) => ({
          place,
          score: score + (Number.isFinite(latitude)
            && Number.isFinite(longitude)
            && Number.isFinite(place.location?.latitude)
            && Number.isFinite(place.location?.longitude)
            ? -distanceBetweenKm(
              latitude,
              longitude,
              place.location.latitude,
              place.location.longitude,
            ) / 100
            : 0),
        }))
        .sort((left, right) => right.score - left.score)[0]?.place;

      const normalizedMatch = match ? normalizePlace(match) : null;
      return normalizedMatch
        ? {
          image: normalizedMatch.image,
          placeId: match.id,
          photoAttributions: normalizedMatch.photoAttributions,
        }
        : { image: null, placeId: null, photoAttributions: [] };
    },

    async searchNearby({ latitude, longitude, distance = 5 }) {
      if (!apiKey) {
        const error = new Error('Google Places API is not configured');
        error.statusCode = 503;
        throw error;
      }
      if (distance === 0) {
        return [];
      }

      const origin = { latitude, longitude };
      let resultSets;

      if (distance > 50) {
        const centers = searchCenters({ latitude, longitude, distance });
        const tiledRadius = (distance / Math.SQRT2) * 1000;
        resultSets = await Promise.all(centers.map((center) => (
          fetchNearbyPlaces(configuration, center, Math.min(tiledRadius, MAX_SEARCH_RADIUS_METERS))
        )));
      } else {
        const initialResults = await fetchNearbyPlaces(
          configuration,
          origin,
          Math.min(distance * 1000, MAX_SEARCH_RADIUS_METERS),
        );
        resultSets = [initialResults];

        if (initialResults.length === MAX_RESULTS_PER_SEARCH) {
          const centers = searchCenters({ latitude, longitude, distance });
          const tiledRadius = (distance / Math.SQRT2) * 1000;
          const additionalResults = await Promise.all(centers.map((center) => (
            fetchNearbyPlaces(configuration, center, Math.min(tiledRadius, MAX_SEARCH_RADIUS_METERS))
          )));
          resultSets.push(...additionalResults);
        }
      }

      const uniquePlaces = new Map();

      resultSets.flat().forEach((place) => {
        if (place.id) {
          uniquePlaces.set(place.id, place);
        }
      });

      return [...uniquePlaces.values()]
        .map((place) => normalizePlace(place, origin))
        .filter((place) => Number.isFinite(place.distance) && place.distance <= distance)
        .sort((left, right) => left.distance - right.distance);
    },

    async searchRestaurants({ query = '', location, latitude, longitude, distance = 15 }) {
      if (!apiKey) {
        const error = new Error('Restaurant discovery is not configured');
        error.statusCode = 503;
        throw error;
      }

      let origin = Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;
      let area = location || null;
      let locationFallback = false;

      if (!origin && !area) {
        area = 'Bhubaneswar';
      } else if (origin && !area) {
        try {
          const result = await geocode(configuration, {
            latlng: `${origin.latitude},${origin.longitude}`,
          });
          area = result.address_components?.find((component) => (
            component.types.includes('sublocality_level_1')
            || component.types.includes('neighborhood')
            || component.types.includes('locality')
          ))?.long_name || null;
        } catch (error) {
          if (![422, 502, 503].includes(error.statusCode)) throw error;
        }
        if (!area) {
          origin = null;
          area = 'Bhubaneswar';
          locationFallback = true;
        }
      }

      const searchText = query.trim();
      const searchArea = /bhubaneswar/i.test(area)
        ? `${area}, Odisha`
        : `${area}, Bhubaneswar, Odisha`;
      const places = searchText || !origin
        ? await fetchTextPlaces(
          configuration,
          searchText
            ? `${searchText}${/\brestaurants?\b/i.test(searchText) ? '' : ' restaurants'} in ${searchArea}`
            : `restaurants in ${searchArea}`,
          origin,
        )
        : await fetchNearbyPlaces(
          configuration,
          origin,
          Math.min(distance * 1000, MAX_SEARCH_RADIUS_METERS),
        );

      return {
        area,
        locationFallback,
        restaurants: places
          .map((place) => normalizePlace(place, origin))
          .filter((place) => (
            !origin || (Number.isFinite(place.distance) && place.distance <= distance)
          ))
          .sort((left, right) => left.distance - right.distance),
      };
    },

    async getPlaceDetails(placeId) {
      if (!apiKey) {
        const error = new Error('Restaurant discovery is not configured');
        error.statusCode = 503;
        throw error;
      }

      const response = await fetchImpl(`${GOOGLE_PHOTO_URL}/places/${encodeURIComponent(placeId)}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': PLACE_FIELDS.replaceAll('places.', ''),
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        const error = new Error('Restaurant details could not be loaded');
        error.statusCode = response.status === 404 ? 404 : 502;
        throw error;
      }
      return normalizePlace(await response.json());
    },

    async reverseGeocode({ latitude, longitude }) {
      if (!apiKey) {
        const error = new Error('Location lookup is not configured');
        error.statusCode = 503;
        throw error;
      }
      const result = await geocode(configuration, {
        latlng: `${latitude},${longitude}`,
      });
      return result.address_components?.find((component) => (
        component.types.includes('sublocality_level_1')
        || component.types.includes('neighborhood')
        || component.types.includes('locality')
      ))?.long_name || null;
    },

    async fetchPhoto(name) {
      if (!apiKey) {
        const error = new Error('Google Places API is not configured');
        error.statusCode = 503;
        throw error;
      }

      const response = await fetchImpl(
        `${GOOGLE_PHOTO_URL}/${name}/media?maxWidthPx=1200`,
        {
          headers: { 'X-Goog-Api-Key': apiKey },
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        const error = new Error('Google Places photo could not be loaded');
        error.statusCode = response.status === 404 ? 404 : 502;
        throw error;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!/^image\/(jpeg|png|webp)$/i.test(contentType)) {
        const error = new Error('Google Places returned an unsupported photo format');
        error.statusCode = 502;
        throw error;
      }

      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType,
      };
    },
  };

  return adapter;
};

const googlePlacesAdapter = createGooglePlacesAdapter({ apiKey: env.GOOGLE_MAPS_API_KEY });

export const isGooglePlacesConfigured = googlePlacesAdapter.isConfigured;
export const searchGooglePlacesNearby = googlePlacesAdapter.searchNearby;
export const searchGooglePlacesRestaurants = googlePlacesAdapter.searchRestaurants;
export const findGoogleRestaurantPhoto = googlePlacesAdapter.findRestaurantPhoto;
export const getGooglePlaceDetails = googlePlacesAdapter.getPlaceDetails;
export const reverseGeocodeGoogleLocation = googlePlacesAdapter.reverseGeocode;
export const fetchGooglePlacePhoto = googlePlacesAdapter.fetchPhoto;

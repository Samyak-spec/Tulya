import { bhubaneswarLocalities, demoOfferList, demoRestaurants } from '../data/demoRestaurants';

const cuisineAliases = {
  chinese: ['chinese', 'chinise', 'chines'],
  italian: ['italian'],
  'north indian': ['north indian', 'northindian'],
  continental: ['continental'],
  asian: ['asian'],
  'fast food': ['fast food', 'fastfood'],
};

const localityAliases = {
  'Sahid Nagar': ['sahid nagar', 'saheed nagar', 'sahidnagar', 'saheednagar'],
  'Kharvela Nagar': ['kharvela nagar', 'kharabela nagar', 'kharvelanagar', 'kharabelanagar'],
};

export const normalizeSearchText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const tokens = (value) => normalizeSearchText(value)
  .split(' ')
  .filter(Boolean)
  .map((token) => ({
    basill: 'basil',
    chinise: 'chinese',
    chines: 'chinese',
    restro: 'restaurant',
    resto: 'restaurant',
    restraunt: 'restaurant',
    resturant: 'restaurant',
    restaurent: 'restaurant',
    bbq: 'barbeque',
  }[token] || token));

const editDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const tokenMatches = (queryToken, candidateToken) => {
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return true;
  const threshold = queryToken.length >= 7 ? 2 : queryToken.length >= 4 ? 1 : 0;
  return threshold > 0 && editDistance(queryToken, candidateToken) <= threshold;
};

const areaTerms = (area) => {
  const canonical = bhubaneswarLocalities.find((locality) => (
    normalizeSearchText(locality) === normalizeSearchText(area)
    || (localityAliases[locality] || []).some((alias) => (
      normalizeSearchText(alias) === normalizeSearchText(area)
    ))
  ));
  return canonical ? [canonical, ...(localityAliases[canonical] || [])] : [area];
};

const cuisineTokenMatches = (queryToken, aliasToken) => {
  if (queryToken === aliasToken) return true;
  if (queryToken.length < 4 || aliasToken.length < 4) return false;
  return editDistance(queryToken, aliasToken) <= (aliasToken.length >= 7 ? 2 : 1);
};

const findCuisine = (queryTokens) => Object.entries(cuisineAliases).find(([, aliases]) => (
  aliases.some((alias) => tokens(alias).every((aliasToken) => (
    queryTokens.some((queryToken) => cuisineTokenMatches(queryToken, aliasToken))
  )))
))?.[0] || null;

const budgetFromQuery = (query) => {
  const numeric = '(\\d[\\d,]*(?:\\.\\d+)?)';
  const match = String(query).match(new RegExp(
    `(?:under|below|within)\\s*(?:₹|rs\\.?\\s*)?${numeric}\\s*(k)?|(?:₹|rs\\.?\\s*)\\s*${numeric}\\s*(k)?\\s*(?:budget)?`,
    'i',
  ));
  if (!match) return null;
  const amount = Number((match[1] || match[3]).replaceAll(',', ''));
  return amount * ((match[2] || match[4]) ? 1000 : 1);
};

export const parseDemoSearchIntent = (query, selectedArea = '') => {
  const source = normalizeSearchText(query);
  const queryTokens = tokens(source);
  const peopleMatch = source.match(/(?:for|table for|party of)\s*(\d+)\s*(?:people|person|guests|guest)?/)
    || source.match(/\b(\d+)\s*(?:people|person|guests|guest)\b/);
  const cuisine = findCuisine(queryTokens);
  const pureVeg = /\bpure veg(?:etarian)?\b/.test(source);
  const vegetarianFriendly = !pureVeg && /\bvegetarian friendly\b/.test(source);
  const location = bhubaneswarLocalities.find((locality) => (
    (localityAliases[locality] || [locality]).some((alias) => (
      source.includes(normalizeSearchText(alias))
    ))
  )) || selectedArea || null;
  const excluded = new Set([
    'restaurant', 'restaurants', 'cafe', 'cafes', 'and', 'for', 'people', 'person', 'guests',
    'guest', 'table', 'party', 'under', 'below', 'within', 'budget', 'of', 'near', 'me', 'with',
    'offers', 'offer', 'discount', 'discounted', 'best', 'deal', 'deals', 'cheapest', 'highest',
    'no', 'current', 'two', '2', 'pure', 'veg', 'vegetarian', 'friendly', 'in', 'the', 'k',
    'rs', 'without',
  ]);
  const terms = queryTokens.filter((token) => (
    !excluded.has(token)
    && !/^\d+k?$/.test(token)
    && !Object.values(cuisineAliases).flat().some((alias) => tokens(alias).includes(token))
    && !(location && areaTerms(location).some((area) => tokens(area).includes(token)))
  ));
  const category = (pureVeg || cuisine || terms.length === 0)
    && (/\bcafe\b|\bcafes\b/.test(source))
    ? 'cafe'
    : null;

  return {
    query,
    cuisine,
    dietary: pureVeg ? 'pureVeg' : vegetarianFriendly ? 'vegetarianFriendly' : null,
    category,
    budget: budgetFromQuery(query),
    people: peopleMatch ? Number(peopleMatch[1]) : null,
    location,
    nearMe: /\bnear me\b/.test(source),
    offerIntent: /\b(with offers?|discounted|best deals?|cheapest|highest discount)\b/.test(source),
    noOfferIntent: /\b(no offers?|without offers?|no current offer)\b/.test(source),
    terms,
  };
};

const restaurantOffers = (restaurant) => restaurant.offers
  || demoOfferList(restaurant);

const genericCuisines = new Set(['restaurant', 'restaurants', 'food', 'cafe', 'bar', 'fast food restaurant']);

const cuisineMatches = (restaurant, cuisine) => {
  if (!cuisine) return true;
  const known = [
    ...(restaurant.cuisines || []),
    restaurant.cuisine,
    restaurant.category,
  ]
    .filter(Boolean)
    .map(normalizeSearchText)
    .filter((item) => item && !genericCuisines.has(item));
  if (!known.length) return true;
  return known.some((item) => item.includes(cuisine))
    || normalizeSearchText(restaurant.name).includes(cuisine);
};

const compactText = (value) => normalizeSearchText(value).replace(/\s+/g, '');

const areaMatches = (restaurant, area) => {
  if (!area || normalizeSearchText(area) === 'bhubaneswar') return true;
  const haystack = compactText(`${restaurant.location || ''} ${restaurant.address || ''}`);
  return areaTerms(area).some((candidate) => haystack.includes(compactText(candidate)));
};

const nameMatches = (restaurant, terms) => {
  if (terms.length === 0) return true;
  const candidateTokens = tokens([
    restaurant.name,
    restaurant.location,
    restaurant.address,
    restaurant.category,
    ...(restaurant.cuisines || []),
  ].filter(Boolean).join(' '));
  return terms.every((term) => candidateTokens.some((candidate) => tokenMatches(term, candidate)));
};

const costForParty = (restaurant, people) => {
  const rawCost = restaurant.costForTwo;
  const costForTwo = typeof rawCost === 'number'
    ? rawCost
    : Number(String(rawCost || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(costForTwo) || costForTwo <= 0 || !people) return null;
  return costForTwo * (people / 2);
};

const getMaxOfferDiscount = (restaurant) => restaurantOffers(restaurant)
  .reduce((highest, offer) => Math.max(highest, offer.discountPercent || 0), 0);

const completenessScore = (restaurant) => [
  restaurant.image,
  restaurant.address,
  restaurant.cuisines?.length,
  restaurant.canonicalRating ?? restaurant.rating,
  restaurant.providers && Object.values(restaurant.providers).some((provider) => provider.deepLink),
].filter(Boolean).length;

const compareRank = (left, right, intent, userLocation) => {
  const leftDistance = Number.isFinite(left.distance) ? left.distance : Number.POSITIVE_INFINITY;
  const rightDistance = Number.isFinite(right.distance) ? right.distance : Number.POSITIVE_INFINITY;
  const leftTokens = tokens(left.name);
  const rightTokens = tokens(right.name);
  const leftRelevance = intent.terms.filter((term) => leftTokens.some((token) => tokenMatches(term, token))).length;
  const rightRelevance = intent.terms.filter((term) => rightTokens.some((token) => tokenMatches(term, token))).length;
  const budgetRelevance = (restaurant) => (
    restaurant.budgetMatch === 'within-budget' ? 1 : 0
  );
  const cuisineRelevance = (restaurant) => {
    if (!intent.cuisine) return 0;
    const known = [
      ...(restaurant.cuisines || []),
      restaurant.cuisine,
      restaurant.category,
    ].filter(Boolean);
    return known.length > 0 && cuisineMatches(restaurant, intent.cuisine) ? 1 : 0;
  };
  const distanceDelta = Number.isFinite(leftDistance) || Number.isFinite(rightDistance)
    ? leftDistance - rightDistance
    : 0;
  const offerPresence = (restaurant) => getMaxOfferDiscount(restaurant) > 0 ? 1 : 0;
  return cuisineRelevance(right) - cuisineRelevance(left)
    || rightRelevance - leftRelevance
    || budgetRelevance(right) - budgetRelevance(left)
    || (userLocation ? distanceDelta : 0)
    || (right.catalogueRating ?? right.rating ?? right.canonicalRating ?? 0)
      - (left.catalogueRating ?? left.rating ?? left.canonicalRating ?? 0)
    || completenessScore(right) - completenessScore(left)
    || offerPresence(right) - offerPresence(left)
    || getMaxOfferDiscount(right) - getMaxOfferDiscount(left)
    || left.name.localeCompare(right.name);
};

export const searchDemoRestaurants = (
  query = '',
  selectedArea = '',
  restaurantSet = demoRestaurants,
  userLocation = null,
) => {
  const intent = parseDemoSearchIntent(query, selectedArea);
  return restaurantSet
    .filter((restaurant) => nameMatches(restaurant, intent.terms))
    .filter((restaurant) => cuisineMatches(restaurant, intent.cuisine))
    .filter((restaurant) => (
      !intent.dietary || restaurant.dietary?.[intent.dietary] === true
    ))
    .filter((restaurant) => (
      !intent.category || normalizeSearchText(restaurant.category).includes(intent.category)
    ))
    .filter((restaurant) => areaMatches(restaurant, intent.location))
    .filter((restaurant) => (
      !intent.offerIntent
      || restaurant.offerDataKnown === false
      || restaurantOffers(restaurant).length > 0
    ))
    .filter((restaurant) => (
      !intent.noOfferIntent
      || restaurant.offerDataKnown === false
      || restaurantOffers(restaurant).length === 0
    ))
    .filter((restaurant) => {
      if (intent.budget === null) return true;
      const estimate = costForParty(restaurant, intent.people);
      return estimate === null || estimate <= intent.budget;
    })
    .map((restaurant) => {
      const budgetEstimate = costForParty(restaurant, intent.people);
      return {
        ...restaurant,
        offers: restaurantOffers(restaurant),
        budgetEstimate,
        budgetEstimateLabel: budgetEstimate === null ? null : 'Estimated for party size',
        budgetMatch: intent.budget === null
          ? 'not-requested'
          : budgetEstimate === null
            ? 'unknown'
            : 'within-budget',
        searchIntent: intent,
      };
    })
    .sort((left, right) => compareRank(left, right, intent, userLocation));
};

export const getDemoSuggestions = (query = '', restaurantSet = demoRestaurants) => {
  const value = normalizeSearchText(query);
  if (!value) return [];
  const words = tokens(value);
  const restaurantSuggestions = [...restaurantSet, ...demoRestaurants]
    .filter((restaurant, index, list) => (
      list.findIndex((entry) => entry.canonicalRestaurantId === restaurant.canonicalRestaurantId) === index
      && words.some((word) => tokens(restaurant.name).some((token) => tokenMatches(word, token)))
    ))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 4)
    .map((restaurant) => ({
      id: restaurant.canonicalRestaurantId || restaurant.id,
      label: restaurant.name,
      detail: restaurant.location || 'Bhubaneswar',
      type: 'restaurant',
      value: restaurant.name,
    }));
  const categorySuggestions = Object.keys(cuisineAliases)
    .filter((cuisine) => tokens(cuisine).some((token) => words.some((word) => tokenMatches(word, token))))
    .slice(0, 2)
    .map((cuisine) => ({
      id: `cuisine-${cuisine}`,
      label: `${cuisine[0].toUpperCase()}${cuisine.slice(1)} restaurants`,
      detail: 'Browse by cuisine',
      type: 'cuisine',
      value: `${cuisine} restaurants`,
    }));
  if (words.some((word) => ['chi', 'chinese'].some((term) => tokenMatches(word, term)))) {
    categorySuggestions.push(
      {
        id: 'chinese-nearby',
        label: 'Chinese restaurants near you',
        detail: 'Nearby dining',
        type: 'cuisine',
        value: 'Chinese restaurants near me',
      },
      {
        id: 'chinese-budget',
        label: 'Chinese restaurants under ₹3000',
        detail: 'Browse by cuisine and budget',
        type: 'cuisine',
        value: 'Chinese restaurants under ₹3000',
      },
    );
  }
  const localitySuggestions = bhubaneswarLocalities
    .filter((locality) => normalizeSearchText(locality).includes(value))
    .slice(0, 2)
    .map((locality) => ({
      id: `area-${locality}`,
      label: locality,
      detail: 'Bhubaneswar area',
      type: 'location',
      value: `restaurants in ${locality}`,
    }));
  return [...categorySuggestions, ...restaurantSuggestions, ...localitySuggestions].slice(0, 6);
};

export const getDemoBestOffer = (restaurant) => restaurantOffers(restaurant)
  .reduce((best, offer) => (
    !best || (offer.discountPercent || offer.discount || 0) > (best.discountPercent || best.discount || 0)
      ? offer
      : best
  ), null);

export const getCatalogueSearchText = (query, intent = parseDemoSearchIntent(query)) => {
  const searchText = intent.dietary === 'pureVeg' && intent.category
    ? `pure vegetarian ${intent.category}`
    : intent.cuisine
      ? `${intent.cuisine} restaurants`
      : intent.terms.join(' ');
  const location = intent.location && normalizeSearchText(intent.location) !== 'bhubaneswar'
    ? ` in ${intent.location}`
    : '';
  if (searchText) return `${searchText}${location}`;
  if (location) return `restaurants${location}`;
  return 'restaurants';
};

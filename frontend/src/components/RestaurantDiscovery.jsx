import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  getSwiggyAddresses,
  compareRestaurantOffers,
  getSwiggySession,
  selectSwiggyAddress,
  searchSwiggyRestaurants,
} from '../services/api';
import { formatCurrency } from '../utils/formatCurrency';
import { getBrowserLocation } from '../utils/browserLocation';
import { bhubaneswarLocalities } from '../data/demoRestaurants';
import {
  getCatalogueSearchText,
  getDemoSuggestions,
  parseDemoSearchIntent,
  searchDemoRestaurants,
} from '../services/demoRestaurantSearch';
import { mergeManualRestaurant } from '../services/restaurantCatalog';
import {
  compareOffers,
  findManualSearchMatch,
  getBestLinkedOffer,
  findManualEnrichment,
  getManualProviderEntries,
  getProvidersWithoutOffers,
  mergeProviderOffers,
  selectBestOfferPerProvider,
} from '../services/manualEnrichment';
import { createSyntheticFallbackOffers } from '../services/syntheticOffers';

const offerFinalAmount = (offer) => {
  const amount = offer.finalPrice ?? offer.effectivePrice ?? offer.finalAmount;
  return amount === null || amount === undefined ? null : Number(amount);
};
const offerOriginalAmount = (offer) => {
  const amount = offer.originalPrice ?? offer.originalAmount;
  return amount === null || amount === undefined ? null : Number(amount);
};
const offerDiscount = (offer) => {
  const amount = offer.discount ?? offer.discountAmount;
  return amount === null || amount === undefined ? null : Number(amount);
};
const offerSavings = (offer) => {
  const original = offerOriginalAmount(offer);
  const final = offerFinalAmount(offer);
  return original === null || final === null ? null : Math.max(original - final, 0);
};

const getProviderRestaurantId = (restaurant) => (
  restaurant.providerRestaurantId
  || restaurant.restaurantId
  || restaurant.providerIds?.swiggy
  || restaurant.id
);

const hasProviderRestaurantId = (restaurant) => {
  const providerRestaurantId = getProviderRestaurantId(restaurant);
  return providerRestaurantId !== null
    && providerRestaurantId !== undefined
    && String(providerRestaurantId).trim().length > 0;
};

const getProviderImage = (imageUrl) => {
  if (typeof imageUrl !== 'string') return null;
  try {
    const url = new URL(imageUrl);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const providerLabel = (provider) => ({
  swiggy: 'Swiggy',
  swiggy_dineout: 'Swiggy',
  district: 'District',
  eazydiner: 'EazyDiner',
}[String(provider || '').toLowerCase()] || provider || 'Provider');

const toFiniteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const mapSwiggyRestaurant = (restaurant) => {
  const rawProviderRestaurantId = getProviderRestaurantId(restaurant);
  if (!hasProviderRestaurantId(restaurant)) return null;
  const providerRestaurantId = String(rawProviderRestaurantId);
  const canonicalRestaurantId = restaurant.canonicalRestaurantId || `swiggy:${providerRestaurantId}`;
  const mappedRestaurant = {
    ...restaurant,
    id: canonicalRestaurantId,
    restaurantId: canonicalRestaurantId,
    canonicalRestaurantId,
    providerRestaurantId,
    providerIds: {
      ...restaurant.providerIds,
      swiggy: String(providerRestaurantId),
      swiggyFood: String(providerRestaurantId),
    },
    cuisine: restaurant.cuisines?.[0] || restaurant.category || null,
    location: restaurant.location || restaurant.areaName || null,
    rating: restaurant.avgRating ?? restaurant.rating ?? null,
    distanceKm: toFiniteNumber(restaurant.distanceKm),
    image: getProviderImage(restaurant.imageUrl),
    source: 'swiggy_catalog',
  };
  const manualRecord = findManualEnrichment(mappedRestaurant);
  return {
    ...mappedRestaurant,
    cuisine: mappedRestaurant.cuisine || manualRecord?.cuisines?.[0] || null,
    category: mappedRestaurant.category || manualRecord?.category || null,
    cuisines: mappedRestaurant.cuisines?.length
      ? mappedRestaurant.cuisines
      : manualRecord?.cuisines || [],
    dietary: {
      ...(manualRecord?.dietary || {}),
      ...(mappedRestaurant.dietary || {}),
    },
    canonicalRating: manualRecord?.canonicalRating ?? null,
    providerRatings: {
      ...(manualRecord?.providerRatings || {}),
      swiggy: mappedRestaurant.rating ?? manualRecord?.providerRatings?.swiggy ?? null,
    },
    offers: Array.isArray(mappedRestaurant.offers) && mappedRestaurant.offers.length > 0
      ? mappedRestaurant.offers
      : manualRecord?.offers || mappedRestaurant.offers,
    offerDataKnown: Boolean(manualRecord) || Array.isArray(mappedRestaurant.offers),
  };
};

const getRestaurantDistance = (restaurant, userLocation) => {
  const latitude = toFiniteNumber(restaurant.latitude);
  const longitude = toFiniteNumber(restaurant.longitude);
  const hasRestaurantCoordinates = latitude !== null
    && longitude !== null
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
  if (userLocation && hasRestaurantCoordinates) {
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(latitude - userLocation.latitude);
    const longitudeDelta = radians(longitude - userLocation.longitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(userLocation.latitude))
        * Math.cos(radians(latitude))
        * Math.sin(longitudeDelta / 2) ** 2;
    const boundedHaversine = Math.min(1, Math.max(0, haversine));
    return 6371 * 2 * Math.atan2(
      Math.sqrt(boundedHaversine),
      Math.sqrt(1 - boundedHaversine),
    );
  }
  return restaurant.distanceKm;
};

function RestaurantDiscovery({ showResultsHeading = false }) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [swiggyAddresses, setSwiggyAddresses] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [rangeKm, setRangeKm] = useState(10);
  const [requiresSwiggyConnection, setRequiresSwiggyConnection] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const visibleRestaurants = useMemo(() => (searchResult?.results || [])
    .map((restaurant) => ({
      ...restaurant,
      distanceKm: getRestaurantDistance(restaurant, userLocation),
    }))
    .filter((restaurant) => (
      !searchResult?.isNearby
      || (Number.isFinite(restaurant.distanceKm)
        ? restaurant.distanceKm <= rangeKm
        : !userLocation)
    ))
    .sort((left, right) => {
      if (!searchResult?.isNearby || left.distanceKm === right.distanceKm) return 0;
      if (left.distanceKm === null) return 1;
      if (right.distanceKm === null) return -1;
      return left.distanceKm - right.distanceKm;
    })
    .slice(0, searchResult?.isNearby ? 5 : searchResult?.results?.length), [
    rangeKm,
    searchResult,
    userLocation,
  ]);

  useEffect(() => {
    if (!visibleRestaurants.some((restaurant) => restaurant.id === activeId)) {
      setActiveId(visibleRestaurants[0]?.id || null);
    }
  }, [activeId, visibleRestaurants]);

  const activeIndex = Math.max(visibleRestaurants.findIndex((restaurant) => restaurant.id === activeId), 0);
  const activeRestaurant = visibleRestaurants[activeIndex];
  const offerComparison = useQuery({
    queryKey: [
      'restaurant-offer-comparison',
      activeRestaurant?.id,
      userLocation?.latitude,
      userLocation?.longitude,
    ],
    queryFn: async () => {
      const response = await compareRestaurantOffers(activeRestaurant, userLocation);
      return response.data.results[0];
    },
    enabled: Boolean(activeRestaurant?.canonicalRestaurantId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: 0,
  });
  const manualProviderEntries = useMemo(
    () => getManualProviderEntries(findManualEnrichment(activeRestaurant)),
    [activeRestaurant],
  );
  const liveOffers = offerComparison.data?.offers || [];
  const providersWithoutOffer = getProvidersWithoutOffers(liveOffers, manualProviderEntries);
  const realComparedOffers = selectBestOfferPerProvider(
    mergeProviderOffers(liveOffers, manualProviderEntries),
  );
  const comparedOffers = [
    ...realComparedOffers,
    ...(offerComparison.isLoading
      ? []
      : createSyntheticFallbackOffers(activeRestaurant, realComparedOffers, liveOffers)),
  ];
  const rankedBestLinkedOffer = offerComparison.data?.bestOffer
    && offerComparison.data.bestOffer.isVerified === true
    && Boolean(offerComparison.data.bestOffer.deepLink)
    && comparedOffers.some((offer) => (
      offer.offerType === offerComparison.data.bestOffer.offerType
      && offer.provider === offerComparison.data.bestOffer.provider
      && offer.finalPrice === offerComparison.data.bestOffer.finalPrice
    ))
    ? offerComparison.data.bestOffer
    : null;
  const activeBestOffer = rankedBestLinkedOffer
    || comparedOffers
      .filter((offer) => (
        offer.isVerified === true
        && Boolean(offer.deepLink)
        && Number.isFinite(offer.finalPrice)
      ))
      .reduce((best, offer) => (!best || offer.finalPrice < best.finalPrice ? offer : best), null)
    || getBestLinkedOffer(comparedOffers)
    || (realComparedOffers.length === 0
      ? [...comparedOffers].filter((offer) => offer.isTemporary === true).sort(compareOffers)[0]
      : null)
    || null;
  const biggestSaving = comparedOffers
    .filter((offer) => offer.isVerified)
    .map(offerSavings)
    .filter(Number.isFinite)
    .reduce((best, savings) => Math.max(best, savings), 0);
  const unknownNearbyDistanceCount = searchResult?.isNearby
    ? searchResult.results.filter((restaurant) => (
      !Number.isFinite(getRestaurantDistance(restaurant, userLocation))
    )).length
    : 0;
  const suggestions = useMemo(() => getDemoSuggestions(query), [query]);
  const submittedIntent = parseDemoSearchIntent(submittedQuery, selectedArea);

  const moveRestaurant = (direction) => {
    if (visibleRestaurants.length < 2) {
      return;
    }

    const nextIndex = (activeIndex + direction + visibleRestaurants.length) % visibleRestaurants.length;
    setActiveId(visibleRestaurants[nextIndex].id);
  };

  const performSwiggySearch = useCallback(async (
    searchText,
    addressId,
    { nearby = false, area = '' } = {},
  ) => {
    setIsSearching(true);
    setSearchError('');
    try {
      const intent = parseDemoSearchIntent(searchText, area);
      const providerQuery = getCatalogueSearchText(searchText, intent);
      const response = await searchSwiggyRestaurants(providerQuery, addressId);
      const restaurants = Array.isArray(response.restaurants) ? response.restaurants : [];
      const mappedRestaurants = restaurants
        .filter(hasProviderRestaurantId)
        .map(mapSwiggyRestaurant)
        .filter(Boolean);
      setSearchResult({
        isNearby: nearby || intent.nearMe,
        results: searchDemoRestaurants(searchText, area, mappedRestaurants),
      });
    } catch {
      setSearchResult({ results: [], isNearby: nearby });
      setSearchError('Swiggy restaurant search could not be completed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (showResultsHeading) return undefined;
    let cancelled = false;

    const loadNearbyRestaurants = async () => {
      setSearchError('');
      try {
        const session = await getSwiggySession();
        if (cancelled) return;
        if (session?.connected !== true) {
          setRequiresSwiggyConnection(true);
          setSearchError('Restaurant search is not connected yet.');
          return;
        }

        const addresses = await getSwiggyAddresses();
        if (cancelled) return;
        setSwiggyAddresses(addresses);
        const selectedAddress = addresses.find((address) => address.selected === true);
        if (!selectedAddress) {
          setSearchError(addresses.length > 0
            ? 'Choose a saved location to find nearby restaurants.'
            : 'No saved locations are available for restaurant discovery.');
          return;
        }

        try {
          const location = await getBrowserLocation();
          if (!cancelled) {
            setUserLocation(location);
            setLocationError('');
          }
        } catch {
          if (!cancelled) {
            setUserLocation(null);
            setLocationError('Browser location is unavailable; discovery will use your selected Swiggy location.');
          }
        }
        if (!cancelled) {
          await performSwiggySearch('restaurants', selectedAddress.id, {
            nearby: true,
          });
        }
      } catch {
        if (!cancelled) setSearchError('Nearby restaurant discovery could not be completed.');
      }
    };

    loadNearbyRestaurants();
    return () => {
      cancelled = true;
    };
  }, [performSwiggySearch, showResultsHeading]);

  const runSearch = async (searchText, area = selectedArea) => {
    const normalizedQuery = searchText.trim();
    const intent = parseDemoSearchIntent(normalizedQuery, area);
    setSubmittedQuery(normalizedQuery);
    setSearchError('');
    setSearchResult(null);
    setRequiresSwiggyConnection(false);
    setIsSuggestionsOpen(false);
    if (!normalizedQuery) return;

    const manualMatch = findManualSearchMatch(normalizedQuery);
    if (manualMatch) {
      setSearchResult({
        isNearby: false,
        results: [mergeManualRestaurant(manualMatch)],
      });
      return;
    }

    setIsSearching(true);
    try {
      const session = await getSwiggySession();
      if (session?.connected !== true) {
        setRequiresSwiggyConnection(true);
        setSearchError('Restaurant search is not connected yet.');
        return;
      }
      try {
        const location = await getBrowserLocation();
        setUserLocation(location);
        setLocationError('');
      } catch {
        setUserLocation(null);
        setLocationError('Browser location is unavailable; discovery is using your saved Swiggy location.');
      }
      const addresses = await getSwiggyAddresses();
      setSwiggyAddresses(addresses);
      const selectedAddress = addresses.find((address) => address.selected === true);
      if (!selectedAddress) {
        setSearchError(addresses.length > 0
          ? 'Choose a saved location to find nearby restaurants.'
          : 'No saved locations are available for restaurant discovery.');
        return;
      }

      await performSwiggySearch(normalizedQuery, selectedAddress.id, {
        nearby: intent.nearMe,
        area,
      });
    } catch {
      setSearchResult({ results: [] });
      setSearchError('Swiggy restaurant search could not be completed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const submitSearch = async (event) => {
    event.preventDefault();
    await runSearch(query, selectedArea);
  };

  const chooseSuggestion = async (suggestion) => {
    const area = suggestion.type === 'location'
      ? parseDemoSearchIntent(suggestion.value).location || selectedArea
      : selectedArea;
    setQuery(suggestion.value);
    setSelectedArea(area || '');
    await runSearch(suggestion.value, area || '');
  };

  const handleAreaSelection = async (event) => {
    const area = event.target.value;
    setSelectedArea(area);
    const searchText = submittedQuery || (area ? `restaurants in ${area}` : 'restaurants');
    await runSearch(searchText, area);
  };

  const handleAddressSelection = async (addressId) => {
    if (!addressId) {
      setSwiggyAddresses((addresses) => addresses.map((address) => ({ ...address, selected: false })));
      setSearchResult(null);
      setSearchError('Choose a saved location to find nearby restaurants.');
      return;
    }

    try {
      setIsSearching(true);
      setSearchError('');
      setSearchResult(null);
      await selectSwiggyAddress(addressId);
      setSwiggyAddresses((addresses) => addresses.map((address) => ({
        ...address,
        selected: address.id === addressId,
      })));
      if (!userLocation) {
        try {
          const location = await getBrowserLocation();
          setUserLocation(location);
          setLocationError('');
        } catch {
          setLocationError('Browser location is unavailable; Swiggy Dineout offers may not be available.');
        }
      }
      await performSwiggySearch(
        submittedQuery || 'restaurants',
        addressId,
        { nearby: !submittedQuery, area: selectedArea },
      );
    } catch {
      setSearchError('The saved location could not be selected. Please try again.');
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSubmittedQuery('');
    setSearchResult(null);
    setSearchError('');
    setIsSuggestionsOpen(false);
    setRequiresSwiggyConnection(false);
  };

  return (
    <div className="discovery-page">
      {activeRestaurant ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeRestaurant.id}
            className="discovery-backdrop"
            style={activeRestaurant.image
              ? { backgroundImage: `url("${activeRestaurant.image}")` }
              : undefined}
            initial={{ opacity: 0.65, scale: 1.025 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            role="img"
            aria-label={`${activeRestaurant.name} restaurant photograph`}
          />
        </AnimatePresence>
      ) : (
        <div className="discovery-backdrop discovery-backdrop-empty" />
      )}
      <div className="discovery-shade" />

      <div className="discovery-content">
        <section className="discovery-toolbar" aria-label="Restaurant search and location">
          <div className="demo-search-shell">
            <form onSubmit={submitSearch} className="discovery-search" role="search">
              <Sparkles size={16} aria-hidden="true" />
              <label className="sr-only" htmlFor="food-search">Find restaurants</label>
              <input
                id="food-search"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setIsSuggestionsOpen(true);
                }}
                onFocus={() => setIsSuggestionsOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setIsSuggestionsOpen(false);
                }}
                placeholder="Find restaurants by name, cuisine or area"
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={isSuggestionsOpen && suggestions.length > 0}
                aria-controls="restaurant-search-suggestions"
              />
              {submittedQuery ? (
                <button type="button" className="search-clear" onClick={clearSearch}>
                  Clear
                </button>
              ) : null}
              <button type="submit" className="search-submit" aria-label="Find restaurants" disabled={isSearching}>
                <Search size={17} />
              </button>
            </form>
            {isSuggestionsOpen && suggestions.length > 0 ? (
              <div
                id="restaurant-search-suggestions"
                className="search-suggestions"
                role="listbox"
                aria-label="Restaurant search suggestions"
              >
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseSuggestion(suggestion)}
                  >
                    <span>{suggestion.label}</span>
                    <small>{suggestion.detail}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="location-controls">
            {swiggyAddresses.length > 0 ? (
              <>
              <label htmlFor="swiggy-address-select">Search area</label>
              <select
                id="swiggy-address-select"
                value={swiggyAddresses.find((address) => address.selected)?.id || ''}
                onChange={(event) => handleAddressSelection(event.target.value)}
                disabled={isSearching}
                aria-label="Select search area"
              >
                <option value="" disabled>Choose a saved location</option>
                {swiggyAddresses.map((address, index) => (
                  <option key={address.id} value={address.id}>Saved location {index + 1}</option>
                ))}
              </select>
              </>
            ) : null}
            <label htmlFor="restaurant-locality-select">Bhubaneswar locality</label>
            <select
              id="restaurant-locality-select"
              value={selectedArea}
              onChange={handleAreaSelection}
              disabled={isSearching}
              aria-label="Filter by Bhubaneswar locality"
            >
              <option value="">All areas</option>
              {bhubaneswarLocalities.filter((locality) => locality !== 'Bhubaneswar').map((locality) => (
                <option key={locality} value={locality}>{locality}</option>
              ))}
            </select>
          </div>
        </section>

        {searchError ? (
          <p className="location-message" role="status">
            {searchError}
            {requiresSwiggyConnection ? (
              <> <a href="http://localhost:4000/api/v1/swiggy/auth/start">Enable restaurant search</a></>
            ) : null}
          </p>
        ) : null}
        {locationError ? <p className="location-message" role="status">{locationError}</p> : null}
        {unknownNearbyDistanceCount > 0 ? (
          <p className="location-message" role="status">
            {unknownNearbyDistanceCount} Swiggy listing(s) do not include a usable distance.
          </p>
        ) : null}
        {isSearching ? <p className="location-message" role="status">Finding restaurants…</p> : null}
        {submittedIntent.budget !== null && searchResult?.results.some((restaurant) => (
          restaurant.budgetMatch === 'unknown'
        )) ? (
          <p className="location-message" role="status">
            Some listings do not include cost-for-two information, so their estimated party cost cannot be checked.
          </p>
          ) : null}
        {showResultsHeading ? <p className="results-context">Restaurant discovery</p> : null}
        {searchResult?.isNearby ? (
          <label className="location-controls" htmlFor="restaurant-range-select">
            Distance range
            <select
              id="restaurant-range-select"
              value={rangeKm}
              onChange={(event) => setRangeKm(Number(event.target.value))}
              aria-label="Distance range"
            >
              {[1, 3, 5, 10].map((distance) => (
                <option key={distance} value={distance}>{distance} km</option>
              ))}
            </select>
          </label>
        ) : null}

        {activeRestaurant ? (
          <main className="discovery-layout">
            <section className="offers-panel" aria-label={`Offers for ${activeRestaurant.name}`}>
              <div className="panel-heading">
                <p className="eyebrow">Best available today</p>
                <h2>Compare restaurant offers</h2>
              </div>

              {comparedOffers.length === 0 ? (
                <div className="no-offers-panel">
                  <p className="offer-discount">
                    {offerComparison.isLoading
                      ? 'Checking provider offers…'
                      : providersWithoutOffer.length > 0
                        ? 'No current offer'
                        : 'No verified dine-in offer available'}
                  </p>
                  <p className="offer-terms">
                    {offerComparison.isError
                      ? 'Provider offer details could not be checked right now.'
                      : (offerComparison.data?.providerStatuses || [])
                        .map(({ provider, status, message }) => (
                          `${provider}: ${message || status.replaceAll('_', ' ')}`
                        ))
                        .join(' · ') || 'Restaurant discovery is available; provider prices and coupons are not supplied.'}
                  </p>
                </div>
              ) : comparedOffers.map((offer, index) => {
                const isBest = offer.isBest === true
                  || (activeBestOffer?.provider === offer.provider
                    && offerFinalAmount(offer) === offerFinalAmount(activeBestOffer)
                    && (offerFinalAmount(offer) !== null
                      || offer.deepLink === activeBestOffer.deepLink));
                const originalAmount = offerOriginalAmount(offer);
                const discount = offerDiscount(offer);
                const finalAmount = offerFinalAmount(offer);
                const percentOff = originalAmount > 0 && discount !== null ? Math.round((discount / originalAmount) * 100) : 0;
                const offerId = `${activeRestaurant.id}-${offer.provider}-${index}`;

                return (
                  <article key={offerId} className={`offer-panel ${isBest ? 'offer-panel-best' : ''}`}>
                    {isBest ? <span className="best-deal-badge">Best deal</span> : null}
                    <div className="offer-topline">
                      <span className="provider-mark" aria-hidden="true">{offer.provider?.slice(0, 2) || 'OF'}</span>
                      <strong>{offer.provider || 'Offer'}</strong>
                      <span className="offer-code">{offer.code || 'Verified offer'}</span>
                    </div>
                    <div className="offer-price-line">
                      <div>
                        <p className="offer-discount">
                          {offer.isManual && offer.discountPercent && offer.deepLink ? (
                            <a href={offer.deepLink} target="_blank" rel="noreferrer">
                              {`${offer.discountPercent}% OFF — ${offer.provider}`}
                            </a>
                          ) : offer.isManual && offer.discountPercent
                            ? `${offer.discountPercent}% OFF — ${offer.provider}`
                            : discount !== null && discount > 0
                              ? `${percentOff}% off`
                              : finalAmount === null
                                ? 'Verified dine-in offer'
                                : 'Listed price'}
                        </p>
                        <p className="offer-terms">
                          {offerSavings(offer) !== null && offerSavings(offer) > 0
                            ? `Save ${formatCurrency(offerSavings(offer))}`
                            : [
                              offer.offerText || 'Savings depend on your provider cart',
                              ...(Array.isArray(offer.eligibility) ? offer.eligibility : []),
                            ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    {(offer.isVerified || offer.isTemporary) && offer.deepLink ? (
                      <a
                        className={`view-deal-button ${isBest ? 'view-deal-best' : ''}`}
                        href={offer.deepLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on {providerLabel(offer.provider)} <ArrowUpRight size={15} />
                      </a>
                    ) : offer.isTemporary ? (
                      <button
                        type="button"
                        className={`view-deal-button ${isBest ? 'view-deal-best' : ''}`}
                        disabled
                      >
                        View on {providerLabel(offer.provider)} <ArrowUpRight size={15} />
                      </button>
                    ) : null}
                  </article>
                );
              })}

              {comparedOffers.length > 0
                ? (offerComparison.data?.providerStatuses || [])
                  .filter(({ message }) => Boolean(message))
                  .map(({ provider, message }) => (
                    <p className="offer-terms" key={`${provider}-${message}`}>{message}</p>
                  ))
                : null}
              {providersWithoutOffer.map((entry) => (
                <p className="offer-terms" key={`${entry.providerId}-no-offer`}>
                  {entry.providerName}: No current offer ·{' '}
                  <a href={entry.deepLink} target="_blank" rel="noreferrer">View on {entry.providerName}</a>
                </p>
              ))}
              <p className="sample-disclaimer">
                Only verified dine-in and table-booking offers are shown.
              </p>
            </section>

            <section className="restaurant-focus" aria-label="Selected restaurant">
              <div className="restaurant-facts">
                {activeRestaurant.canonicalRating !== null
                && activeRestaurant.canonicalRating !== undefined ? (
                  <span><Star size={14} className="fact-star" /> {activeRestaurant.canonicalRating} Tulya rating</span>
                  ) : null}
                {activeRestaurant.rating !== null && activeRestaurant.rating !== undefined ? (
                  <span><Star size={14} className="fact-star" /> {activeRestaurant.rating} Rating</span>
                ) : null}
                {manualProviderEntries
                  .filter((entry) => entry.providerId !== 'swiggy' && entry.rating !== null)
                  .map((entry) => (
                    <span key={`${entry.providerId}-rating`}>
                      <Star size={14} className="fact-star" /> {entry.rating} {entry.providerName} rating
                    </span>
                  ))}
                {activeRestaurant.cuisine ? <span>{activeRestaurant.cuisine}</span> : null}
                {activeRestaurant.costForTwo ? <span>{activeRestaurant.costForTwo}</span> : null}
                {activeRestaurant.budgetEstimate !== null
                && activeRestaurant.budgetEstimate !== undefined ? (
                  <span>
                    {activeRestaurant.budgetEstimateLabel}: {formatCurrency(activeRestaurant.budgetEstimate)}
                    {' '}(estimated from cost for two)
                  </span>
                  ) : null}
                {Number.isFinite(activeRestaurant.distanceKm)
                  ? <span>{activeRestaurant.distanceKm} km away</span>
                  : activeRestaurant.location ? <span>{activeRestaurant.location}</span> : null}
                {activeRestaurant.availabilityStatus ? <span>{activeRestaurant.availabilityStatus}</span> : null}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeRestaurant.id}
                  className="restaurant-copy"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <p className="eyebrow">A table worth finding</p>
                  <h1>{activeRestaurant.name}</h1>
                  {activeRestaurant.description || activeRestaurant.availabilityStatus ? (
                    <p className="restaurant-description">
                      {activeRestaurant.description || activeRestaurant.availabilityStatus}
                    </p>
                  ) : null}
                  {(activeBestOffer?.isVerified || activeBestOffer?.isTemporary) && activeBestOffer.deepLink ? (
                    <a
                      className="primary-discovery-cta best-offer-cta"
                      href={activeBestOffer.deepLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Best offer <ArrowUpRight size={17} />
                    </a>
                  ) : activeBestOffer?.isTemporary ? (
                    <button type="button" className="primary-discovery-cta best-offer-cta" disabled>
                      Best offer <ArrowUpRight size={17} />
                    </button>
                  ) : null}
                </motion.div>
              </AnimatePresence>

              <div className="carousel-controls" aria-label="Choose a restaurant">
                <button type="button" onClick={() => moveRestaurant(-1)} aria-label="Previous restaurant" disabled={visibleRestaurants.length < 2}>
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={() => moveRestaurant(1)} aria-label="Next restaurant" disabled={visibleRestaurants.length < 2}>
                  <ChevronRight size={18} />
                </button>
                <span className="carousel-count">{String(activeIndex + 1).padStart(2, '0')} / {String(visibleRestaurants.length).padStart(2, '0')}</span>
              </div>
            </section>

            <aside className="insights-panel" aria-label="Restaurant comparison insights">
              <p className="eyebrow">The details, distilled</p>
              <div className="insight-item">
                <strong>{biggestSaving > 0 ? formatCurrency(biggestSaving) : '—'}</strong>
                <h2>Biggest savings</h2>
                <p>For the selected restaurant.</p>
              </div>
              <div className="insight-item">
                <strong>{comparedOffers.length}</strong>
                <h2>Verified offers</h2>
                <p>For dining at this restaurant.</p>
              </div>
              <div className="insight-item">
                <strong>{activeRestaurant.canonicalRating ?? activeRestaurant.rating ?? '—'}</strong>
                <h2>{activeRestaurant.canonicalRating === null
                  || activeRestaurant.canonicalRating === undefined
                  ? 'Rating'
                  : 'Tulya rating'}</h2>
                <p>{activeRestaurant.canonicalRating === null
                  || activeRestaurant.canonicalRating === undefined
                  ? 'Rating from the Swiggy restaurant listing.'
                  : 'Canonical Tulya rating; provider ratings are shown separately.'}</p>
              </div>
              <div className="insight-location">
                <MapPin size={15} />
                <span>{Number.isFinite(activeRestaurant.distanceKm)
                  ? `${activeRestaurant.distanceKm} km away`
                  : activeRestaurant.location || 'Selected search area'}</span>
              </div>
            </aside>
          </main>
        ) : (
          <div className="empty-discovery">
            <p className="eyebrow">{isSearching ? 'Finding restaurants' : searchError ? 'Search unavailable' : 'Restaurant discovery'}</p>
            <h1>
              {isSearching
                ? 'Finding nearby restaurants.'
                : submittedQuery
                  ? 'No restaurants matched that search.'
                  : 'Find restaurants and compare their dining offers.'}
            </h1>
            <p>
              {searchError || (submittedQuery
                ? 'Try a different cuisine or search phrase.'
                : 'Search by restaurant, cuisine or area to find your next table.')}
            </p>
            {submittedQuery ? (
              <button type="button" className="primary-discovery-cta" onClick={clearSearch}>
                Clear search
              </button>
            ) : null}
          </div>
        )}

        <section className="nearby-strip" aria-label="Restaurant offers to explore">
          <div className="nearby-strip-heading">
            <div>
              <p className="eyebrow">Restaurants to explore</p>
              <h2>Discover nearby restaurants</h2>
            </div>
            <span aria-live="polite">
              {`${visibleRestaurants.length} ${visibleRestaurants.length === 1 ? 'place' : 'places'}`}
            </span>
          </div>
          <div className="nearby-list">
            {visibleRestaurants.map((restaurant) => {
              const selected = restaurant.id === activeRestaurant?.id;
              const selectedPrice = selected && activeBestOffer?.isVerified
                ? offerFinalAmount(activeBestOffer)
                : null;
              return (
                <button
                  key={restaurant.id}
                  type="button"
                  className={`nearby-item ${selected ? 'nearby-item-active' : ''}`}
                  onClick={() => {
                    setActiveId(restaurant.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  {restaurant.image ? (
                    <img src={restaurant.image} alt="" loading="lazy" />
                  ) : (
                    <span className="nearby-image-empty" aria-hidden="true"><MapPin size={17} /></span>
                  )}
                  <span className="nearby-item-copy">
                    <strong>{restaurant.name}</strong>
                    <small>{restaurant.cuisine || restaurant.category || 'Restaurant'}</small>
                  </span>
                  <span className="nearby-item-price">
                    {selectedPrice !== null ? formatCurrency(selectedPrice) : 'Compare offers'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export default RestaurantDiscovery;

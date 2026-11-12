import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BadgePercent, MapPin, Search, Sparkles, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  bhubaneswarLocalities,
  demoProviders,
  formatDemoOfferType,
} from '../data/demoRestaurants';
import { discoverRestaurants } from '../services/api';
import {
  getCatalogueSearchText,
  getDemoSuggestions,
  parseDemoSearchIntent,
} from '../services/demoRestaurantSearch';
import { mergeRestaurantCatalogue, rankRestaurants } from '../services/restaurantCatalog';

const DEFAULT_AREA = 'Bhubaneswar';
const MAX_HOMEPAGE_RESTAURANTS = 5;

const getCurrentLocation = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('Location is unavailable in this browser.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({
      latitude: coords.latitude,
      longitude: coords.longitude,
    }),
    () => reject(new Error('Location access was not granted.')),
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
  );
});

function RestaurantDiscovery({ showResultsHeading = false }) {
  const [query, setQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState(DEFAULT_AREA);
  const [userLocation, setUserLocation] = useState(null);
  const [catalogueResults, setCatalogueResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [submittedQuery, setSubmittedQuery] = useState('');

  const intent = parseDemoSearchIntent(query, selectedArea);
  const searchResults = useMemo(() => rankRestaurants(
    mergeRestaurantCatalogue(catalogueResults, submittedQuery, selectedArea, userLocation),
    { userLocation, query: submittedQuery },
  ), [catalogueResults, selectedArea, submittedQuery, userLocation]);
  const isHomepage = !submittedQuery;
  const displayedRestaurants = isHomepage
    ? searchResults.filter((restaurant) => !restaurant.manuallyEnriched)
      .slice(0, MAX_HOMEPAGE_RESTAURANTS)
    : searchResults;
  const activeRestaurant = displayedRestaurants.find((restaurant) => (
    restaurant.canonicalRestaurantId === activeId
  )) || displayedRestaurants[0] || null;
  const suggestions = useMemo(() => getDemoSuggestions(
    query,
    mergeRestaurantCatalogue(catalogueResults, '', selectedArea, userLocation),
  ), [catalogueResults, query, selectedArea, userLocation]);

  const performSearch = async ({
    searchText = query,
    area = selectedArea,
    coordinates = userLocation,
  } = {}) => {
    const nextQuery = searchText.trim();
    const nextIntent = parseDemoSearchIntent(nextQuery, area);
    const explicitLocation = parseDemoSearchIntent(nextQuery).location;
    const location = explicitLocation || (coordinates ? undefined : area || DEFAULT_AREA);
    setSubmittedQuery(nextQuery);
    setIsSuggestionsOpen(false);
    setIsLoading(true);
    setSearchError('');

    try {
      const response = await discoverRestaurants({
        query: getCatalogueSearchText(nextQuery, nextIntent),
        ...(location ? { location } : {}),
        ...(coordinates ? {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        } : {}),
        distance: 20,
      });
      setCatalogueResults(response.data.restaurants || []);
      if (response.data.locationFallback) {
        setUserLocation(null);
        setSelectedArea(response.data.location);
        setLocationStatus(
          `Your exact locality could not be determined. Showing ${response.data.location}; choose a locality to refine.`,
        );
      } else if (response.data.location && coordinates) {
        setSelectedArea(response.data.location);
      }
      setActiveId(null);
    } catch {
      setSearchError('Restaurant discovery is temporarily unavailable. Please try again.');
      setCatalogueResults([]);
      setActiveId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadInitialRestaurants = async () => {
      let coordinates = null;
      try {
        if (navigator.permissions?.query) {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          if (permission.state === 'granted') coordinates = await getCurrentLocation();
          else if (permission.state === 'denied') {
            setLocationStatus('Location access was denied. Choose a Bhubaneswar locality to continue.');
          }
        }
      } catch {
        coordinates = null;
      }
      if (cancelled) return;
      if (coordinates) setUserLocation(coordinates);
      try {
        const response = await discoverRestaurants({
          query: '',
          ...(coordinates ? {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          } : { location: DEFAULT_AREA }),
          distance: 20,
        });
        if (cancelled) return;
        setCatalogueResults(response.data.restaurants || []);
        if (response.data.locationFallback) {
          setUserLocation(null);
          setSelectedArea(response.data.location);
          setLocationStatus(
            `Your exact locality could not be determined. Showing ${response.data.location}; choose a locality to refine.`,
          );
        } else if (coordinates && response.data.location) {
          setSelectedArea(response.data.location);
        }
        setSearchError('');
      } catch {
        if (!cancelled) {
          setCatalogueResults([]);
          setSearchError('Restaurant discovery is temporarily unavailable. Please try again.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadInitialRestaurants();
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseSuggestion = (suggestion) => {
    setQuery(suggestion.value);
    const location = suggestion.type === 'location'
      ? suggestion.value.replace(/^restaurants in /i, '')
      : selectedArea;
    if (suggestion.type === 'location') setSelectedArea(location);
    performSearch({ searchText: suggestion.value, area: location });
  };

  const searchAreaChanged = (event) => {
    const area = event.target.value;
    setSelectedArea(area);
    performSearch({ area, coordinates: null });
  };

  const useBrowserLocation = async () => {
    setLocationStatus('Checking your location…');
    try {
      const coordinates = await getCurrentLocation();
      setUserLocation(coordinates);
      setLocationStatus('Showing restaurants near your current location.');
      await performSearch({ coordinates });
    } catch {
      setUserLocation(null);
      setLocationStatus('Location access was denied. Choose a Bhubaneswar locality to continue.');
      await performSearch({ area: selectedArea || DEFAULT_AREA, coordinates: null });
    }
  };

  const bestOffer = activeRestaurant?.offers?.reduce((best, offer) => (
    !best || (offer.discountPercent || 0) > (best.discountPercent || 0) ? offer : best
  ), null);

  return (
    <div className="discovery-page">
      {activeRestaurant?.image ? (
        <div
          className="discovery-backdrop"
          style={{ backgroundImage: `url("${activeRestaurant.image}")` }}
          role="img"
          aria-label={`${activeRestaurant.name} restaurant photograph`}
        />
      ) : <div className="discovery-backdrop discovery-backdrop-empty" />}
      <div className="discovery-shade" />
      <div className="discovery-content">
        <section className="discovery-toolbar" aria-label="Restaurant search and location">
          <div className="demo-search-shell">
            <form
              className="discovery-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                performSearch();
              }}
            >
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
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => {
                    setQuery('');
                    setSubmittedQuery('');
                    performSearch({ searchText: '', coordinates: userLocation });
                  }}
                >
                  Clear
                </button>
              ) : null}
              <button type="submit" className="search-submit" aria-label="Find restaurants" disabled={isLoading}>
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

          <div className="demo-location-controls">
            <label htmlFor="search-area">Search area</label>
            <select id="search-area" value={selectedArea} onChange={searchAreaChanged} disabled={isLoading}>
              {bhubaneswarLocalities.map((locality) => (
                <option key={locality} value={locality}>{locality}</option>
              ))}
            </select>
            <button type="button" className="location-button" onClick={useBrowserLocation}>
              <MapPin size={14} /> Use my location
            </button>
          </div>
        </section>

        {locationStatus ? <p className="location-message" role="status">{locationStatus}</p> : null}
        {searchError ? (
          <p className="location-message" role="status">
            {searchError}
            <button type="button" onClick={() => performSearch()}> Retry</button>
          </p>
        ) : null}
        {showResultsHeading ? <p className="results-context">Restaurant discovery</p> : null}
        {intent.budget !== null ? (
          <p className="location-message" role="status">
            Budget: ₹{intent.budget}{intent.people ? ` for ${intent.people} people` : ''}.
            {searchResults.some((restaurant) => restaurant.budgetMatch === 'unknown')
              ? ' Price information is unavailable for some restaurants.'
              : ''}
          </p>
        ) : null}

        {activeRestaurant ? (
          <main className="discovery-layout">
            <section className="offers-panel" aria-label={`Offers for ${activeRestaurant.name}`}>
              <div className="panel-heading">
                <p className="eyebrow">Best available today</p>
                <h2>Compare restaurant offers</h2>
              </div>
              {activeRestaurant.offers?.length ? (
                demoProviders.map(({ id, name }) => {
                  const providerData = activeRestaurant.providers?.[id];
                  const offers = activeRestaurant.offers.filter((offer) => offer.provider === id);
                  if (!offers.length && !providerData?.deepLink) return null;
                  return (
                    <article className="demo-provider" key={id}>
                      <div className="demo-provider-heading">
                        <strong>{name}</strong>
                        {activeRestaurant.providerRatings?.[id] !== null
                        && activeRestaurant.providerRatings?.[id] !== undefined ? (
                          <span><Star size={12} /> {activeRestaurant.providerRatings[id]}</span>
                          ) : null}
                      </div>
                      {offers.map((offer, index) => (
                        <div className="demo-offer" key={`${id}-${index}`}>
                          <span className="demo-offer-title">
                            <BadgePercent size={14} /> {offer.title}
                          </span>
                          <small>
                            {formatDemoOfferType(offer.offerType)}
                            {offer.terms ? ` · ${offer.terms}` : ''}
                          </small>
                        </div>
                      ))}
                      {providerData?.deepLink ? (
                        <a
                          className="demo-provider-link"
                          href={providerData.deepLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on {name} <ArrowUpRight size={14} />
                        </a>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="demo-no-offer">No current offer</p>
              )}
              {bestOffer ? (
                <p className="demo-best-offer">
                  Best available offer: {bestOffer.discountPercent}% off · {formatDemoOfferType(bestOffer.offerType)}
                </p>
              ) : null}
            </section>

            <section className="restaurant-focus" aria-label="Selected restaurant">
              <div className="restaurant-facts">
                {activeRestaurant.canonicalRating !== null
                && activeRestaurant.canonicalRating !== undefined ? (
                  <span><Star size={14} className="fact-star" /> {activeRestaurant.canonicalRating} Tulya rating</span>
                  ) : activeRestaurant.catalogueRating !== null
                    && activeRestaurant.catalogueRating !== undefined ? (
                      <span><Star size={14} className="fact-star" /> {activeRestaurant.catalogueRating} rating</span>
                    ) : null}
                {activeRestaurant.cuisines?.length ? <span>{activeRestaurant.cuisines.join(' · ')}</span> : null}
                {activeRestaurant.dietary?.pureVeg === true ? <span>Pure vegetarian</span> : null}
                {activeRestaurant.location ? <span>{activeRestaurant.location}</span> : null}
              </div>
              {activeRestaurant.photoAttributions?.[0]?.displayName ? (
                <small className="photo-attribution">
                  Photo: {activeRestaurant.photoAttributions[0].uri ? (
                    <a href={activeRestaurant.photoAttributions[0].uri} target="_blank" rel="noreferrer">
                      {activeRestaurant.photoAttributions[0].displayName}
                    </a>
                  ) : activeRestaurant.photoAttributions[0].displayName}
                </small>
              ) : null}
              <div className="restaurant-copy">
                <p className="eyebrow">A table worth finding</p>
                <h1>{activeRestaurant.name}</h1>
                {activeRestaurant.address ? (
                  <p className="restaurant-description">{activeRestaurant.address}</p>
                ) : null}
                {demoProviders.some(({ id }) => activeRestaurant.providerRatings?.[id] != null) ? (
                <div className="demo-ratings" aria-label="Provider ratings">
                  <strong>Provider ratings</strong>
                  {demoProviders.map(({ id, name }) => (
                    activeRestaurant.providerRatings?.[id] !== null
                    && activeRestaurant.providerRatings?.[id] !== undefined ? (
                      <span key={id}>{name}: {activeRestaurant.providerRatings[id]} ★</span>
                      ) : null
                  ))}
                </div>
                ) : null}
                <Link
                  className="primary-discovery-cta"
                  to={`/restaurants/${encodeURIComponent(activeRestaurant.canonicalRestaurantId)}`}
                  state={{ restaurant: activeRestaurant, restaurants: displayedRestaurants }}
                >
                  View restaurant <ArrowUpRight size={17} />
                </Link>
              </div>
            </section>

            <aside className="insights-panel" aria-label="Restaurant comparison insights">
              <p className="eyebrow">The details, distilled</p>
              <div className="insight-item">
                <strong>{bestOffer ? `${bestOffer.discountPercent}%` : '—'}</strong>
                <h2>Best available offer</h2>
                <p>{activeRestaurant.offers?.length || 0} dine-in offers to compare</p>
              </div>
              <div className="insight-item">
                <strong>{activeRestaurant.canonicalRating ?? '—'}</strong>
                <h2>Tulya rating</h2>
                <p>Shown separately from provider ratings.</p>
              </div>
              <div className="insight-item">
                <strong>{activeRestaurant.cuisines?.length ? activeRestaurant.cuisines[0] : '—'}</strong>
                <h2>Cuisine</h2>
                <p>{activeRestaurant.cuisines?.length > 1 ? activeRestaurant.cuisines.slice(1).join(', ') : activeRestaurant.category || 'Restaurant'}</p>
              </div>
              <div className="insight-location">
                <MapPin size={15} />
                <span>{activeRestaurant.location || selectedArea}</span>
              </div>
            </aside>
          </main>
        ) : (
          <div className="empty-discovery">
            <p className="eyebrow">{isLoading ? 'Restaurant discovery' : 'Restaurant discovery'}</p>
            <h1>
              {isLoading
                ? 'Finding restaurants near you.'
                : searchError
                  ? 'Restaurants will be back shortly.'
                  : submittedQuery
                    ? 'No matching restaurants found.'
                    : 'Find restaurants and compare their dining offers.'}
            </h1>
            <p>
              {searchError || (submittedQuery
                ? 'Try a different restaurant, cuisine or Bhubaneswar area.'
                : 'Search restaurants, discover what is nearby, and compare available offers.')}
            </p>
            {!isLoading && !searchError && submittedQuery ? (
              <p className="offer-terms">No current offer? You can still explore the restaurant.</p>
            ) : null}
          </div>
        )}

        <section className="nearby-strip" aria-label="Restaurant results">
          <div className="nearby-strip-heading">
            <div>
              <p className="eyebrow">Restaurants to explore</p>
              <h2>{isHomepage ? 'Top-rated nearby' : 'Search results'}</h2>
            </div>
            <span aria-live="polite">
              {`${displayedRestaurants.length} ${displayedRestaurants.length === 1 ? 'place' : 'places'}`}
            </span>
          </div>
          {isLoading && displayedRestaurants.length === 0 ? (
            <p className="offer-terms">Finding restaurants…</p>
          ) : null}
          <div className="nearby-list">
            {displayedRestaurants.map((restaurant) => (
              <Link
                key={restaurant.canonicalRestaurantId}
                to={`/restaurants/${encodeURIComponent(restaurant.canonicalRestaurantId)}`}
                state={{ restaurant, restaurants: displayedRestaurants }}
                className={`nearby-item ${restaurant.canonicalRestaurantId === activeRestaurant?.canonicalRestaurantId ? 'nearby-item-active' : ''}`}
                aria-label={`${restaurant.name}, ${restaurant.location || 'Bhubaneswar'}`}
                onClick={() => setActiveId(restaurant.canonicalRestaurantId)}
              >
                {restaurant.image ? (
                  <>
                    <img src={restaurant.image} alt="" loading="lazy" />
                    {restaurant.photoAttributions?.[0]?.displayName ? (
                      <small className="photo-attribution nearby-photo-credit">
                        {restaurant.photoAttributions[0].displayName}
                      </small>
                    ) : null}
                  </>
                ) : (
                  <span className="nearby-image-empty" aria-hidden="true"><MapPin size={17} /></span>
                )}
                <span className="nearby-item-copy">
                  <strong>{restaurant.name}</strong>
                  <small>
                    {restaurant.rating ?? restaurant.canonicalRating ?? 'Rating unavailable'}
                    {restaurant.location ? ` · ${restaurant.location}` : ''}
                  </small>
                </span>
                <span className="nearby-item-price">
                  {restaurant.offers?.length ? 'Offers available' : 'No current offer'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default RestaurantDiscovery;

import {
  ArrowLeft,
  ArrowUpRight,
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Star,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { demoProviders, demoRestaurants, formatDemoOfferType } from '../data/demoRestaurants';
import { getRestaurantById, getRestaurantPhotoMatch } from '../services/api';
import {
  mergeManualRestaurant,
  mergeRestaurantCatalogue,
} from '../services/restaurantCatalog';

const getManualRestaurant = (id) => demoRestaurants.find((restaurant) => (
  restaurant.canonicalRestaurantId === id || restaurant.id === id
));

function RestaurantDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const manualRestaurant = getManualRestaurant(id);
  const stateRestaurant = location.state?.restaurant;
  const currentRestaurant = stateRestaurant || manualRestaurant;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['restaurant-catalogue-detail', id],
    queryFn: () => getRestaurantById(id),
    enabled: !currentRestaurant && id.startsWith('google:'),
    retry: 1,
  });
  const photoCandidate = currentRestaurant || data?.data;
  const existingProviderImage = Object.values(photoCandidate?.providers || {})
    .map((provider) => provider?.image || provider?.imageUrl)
    .find((image) => typeof image === 'string' && image.length > 0);
  const existingImage = photoCandidate?.image;
  const imageSearch = useQuery({
    queryKey: ['restaurant-image-enrichment', id],
    queryFn: async () => {
      const response = await getRestaurantPhotoMatch({
        name: photoCandidate.name,
        ...(photoCandidate.location ? { location: photoCandidate.location } : {}),
        ...(photoCandidate.address ? { address: photoCandidate.address } : {}),
        ...(photoCandidate.providerIds?.googlePlaces
          ? { googlePlaceId: photoCandidate.providerIds.googlePlaces }
          : photoCandidate.canonicalRestaurantId?.startsWith('google:')
            ? { googlePlaceId: photoCandidate.canonicalRestaurantId.slice('google:'.length) }
          : {}),
        ...(Number.isFinite(photoCandidate.latitude)
          && Number.isFinite(photoCandidate.longitude)
          ? {
            latitude: photoCandidate.latitude,
            longitude: photoCandidate.longitude,
          }
          : {}),
      });
      return response.data;
    },
    enabled: Boolean(photoCandidate && !existingImage),
    retry: 0,
  });
  const matchedImage = imageSearch.data?.image;
  const resolvedImage = existingImage || matchedImage || existingProviderImage;
  const rawRestaurant = photoCandidate && resolvedImage
    ? {
      ...photoCandidate,
      image: resolvedImage,
      ...(matchedImage ? {
        photoAttributions: imageSearch.data.photoAttributions || photoCandidate.photoAttributions,
        providerIds: {
          ...photoCandidate.providerIds,
          googlePlaces: imageSearch.data.placeId,
        },
      } : {}),
    }
    : currentRestaurant || (data?.data
      ? mergeRestaurantCatalogue([data.data])[0]
      : null);
  const restaurant = rawRestaurant
    ? (manualRestaurant && rawRestaurant.canonicalRestaurantId === manualRestaurant.canonicalRestaurantId
      ? mergeManualRestaurant({ ...manualRestaurant, ...rawRestaurant })
      : rawRestaurant)
    : null;
  const carouselRestaurants = Array.isArray(location.state?.restaurants)
    ? [...location.state.restaurants]
    : [];
  if (restaurant && !carouselRestaurants.some(
    (item) => item.canonicalRestaurantId === restaurant.canonicalRestaurantId,
  )) {
    carouselRestaurants.push(restaurant);
  }
  const activeCarouselIndex = carouselRestaurants.findIndex(
    (item) => item.canonicalRestaurantId === restaurant?.canonicalRestaurantId,
  );
  const offers = (restaurant?.offers || []).filter((offer) => offer.isVerified === true);
  const bestOffer = offers
    .filter((offer) => offer.deepLink)
    .sort((left, right) => (right.discountPercent || 0) - (left.discountPercent || 0))[0];
  const menuCategories = (restaurant?.menu?.categories || [])
    .map((category) => ({
      ...category,
      items: (Array.isArray(category.items) ? category.items : [])
        .map((item) => (typeof item === 'string' ? item : item?.name || item?.title))
        .filter(Boolean),
    }))
    .filter((category) => category.items.length);
  const menuLink = restaurant?.menu?.deepLink;

  const navigateCarousel = (index) => {
    const nextRestaurant = carouselRestaurants[index];
    if (!nextRestaurant) return;
    navigate(`/restaurants/${encodeURIComponent(nextRestaurant.canonicalRestaurantId)}`, {
      state: { restaurant: nextRestaurant, restaurants: carouselRestaurants },
    });
  };

  if (isLoading && !restaurant) {
    return <Layout><div className="page-shell">Loading restaurant details…</div></Layout>;
  }

  if (isError || !restaurant) {
    return (
      <Layout>
        <div className="page-shell">
          <p className="eyebrow">Restaurant not found</p>
          <Link to="/" className="mt-4 inline-flex items-center gap-2 text-lavender underline">
            <ArrowLeft size={16} /> Back to discovery
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <section
        className="restaurant-detail"
        aria-label={`${restaurant.name} restaurant details`}
      >
        <div
          className={`restaurant-detail-backdrop${restaurant.image ? '' : ' restaurant-detail-backdrop-empty'}`}
          style={restaurant.image ? { backgroundImage: `url("${restaurant.image}")` } : undefined}
          aria-hidden="true"
        />
        <div className="restaurant-detail-shade" aria-hidden="true" />
        <div className="restaurant-detail-content">
          <Link to="/" className="restaurant-detail-back">
            <ArrowLeft size={16} /> Back to restaurants
          </Link>

          <div className="discovery-layout restaurant-detail-layout">
            <section className="offers-panel" aria-label={`Offers for ${restaurant.name}`}>
              <div className="panel-heading">
                <p className="eyebrow">Best available today</p>
                <h2>Compare restaurant offers</h2>
              </div>
              {offers.length ? (
                demoProviders.map(({ id: providerId, name }) => {
                  const providerOffers = offers.filter((offer) => offer.provider === providerId);
                  if (!providerOffers.length) return null;
                  return (
                    <article className="demo-provider" key={providerId}>
                      <div className="demo-provider-heading">
                        <strong>{name}</strong>
                        {restaurant.providerRatings?.[providerId] !== null
                        && restaurant.providerRatings?.[providerId] !== undefined ? (
                          <span><Star size={12} /> {restaurant.providerRatings[providerId]}</span>
                          ) : null}
                      </div>
                      {providerOffers.map((offer, index) => (
                        <div className="demo-offer" key={`${providerId}-${index}`}>
                          <span className="demo-offer-title">
                            <BadgePercent size={14} /> {offer.title || offer.offerText}
                          </span>
                          <small>
                            {formatDemoOfferType(offer.offerType)}
                            {offer.terms ? ` · ${offer.terms}` : ''}
                            {offer.eligibility?.length ? ` · ${offer.eligibility.join(', ')}` : ''}
                          </small>
                        </div>
                      ))}
                      {providerOffers[0].deepLink ? (
                        <a
                          className="demo-provider-link"
                          href={providerOffers[0].deepLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View offer <ArrowUpRight size={14} />
                        </a>
                      ) : null}
                    </article>
                  );
                })
              ) : <p className="demo-no-offer">No current offer</p>}
            </section>

            <section className="restaurant-focus" aria-label="Selected restaurant">
              <div className="restaurant-facts">
                {restaurant.canonicalRating !== null && restaurant.canonicalRating !== undefined ? (
                  <span><Star size={14} className="fact-star" /> {restaurant.canonicalRating} Tulya rating</span>
                ) : null}
                {restaurant.cuisines?.length ? <span>{restaurant.cuisines.join(' · ')}</span> : null}
                {restaurant.dietary?.pureVeg === true ? <span>Pure vegetarian</span> : null}
                {restaurant.location ? <span>{restaurant.location}</span> : null}
              </div>
              {restaurant.photoAttributions?.[0]?.displayName ? (
                <small className="photo-attribution">
                  Photo: {restaurant.photoAttributions[0].uri ? (
                    <a href={restaurant.photoAttributions[0].uri} target="_blank" rel="noreferrer">
                      {restaurant.photoAttributions[0].displayName}
                    </a>
                  ) : restaurant.photoAttributions[0].displayName}
                </small>
              ) : null}
              <div className="restaurant-copy">
                <p className="eyebrow">
                  {restaurant.cuisines?.join(' · ') || restaurant.category || 'Restaurant'}
                </p>
                <h1>{restaurant.name}</h1>
                {restaurant.address ? (
                  <p className="restaurant-description">{restaurant.address}</p>
                ) : null}
                {bestOffer ? (
                  <a
                    className="primary-discovery-cta"
                    href={bestOffer.deepLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View best offer <ArrowUpRight size={17} />
                  </a>
                ) : (
                  <button className="primary-discovery-cta" type="button" disabled>
                    No verified offer available
                  </button>
                )}
              </div>
              {carouselRestaurants.length > 1 ? (
                <nav className="restaurant-detail-controls" aria-label="Restaurant navigation">
                  <button
                    type="button"
                    aria-label="Previous restaurant"
                    disabled={activeCarouselIndex <= 0}
                    onClick={() => navigateCarousel(activeCarouselIndex - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>{String(activeCarouselIndex + 1).padStart(2, '0')} / {String(carouselRestaurants.length).padStart(2, '0')}</span>
                  <button
                    type="button"
                    aria-label="Next restaurant"
                    disabled={activeCarouselIndex < 0 || activeCarouselIndex >= carouselRestaurants.length - 1}
                    onClick={() => navigateCarousel(activeCarouselIndex + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </nav>
              ) : null}
            </section>

            <aside className="insights-panel" aria-label="Restaurant details">
              <p className="eyebrow">The details, distilled</p>
              <div className="insight-item">
                <strong>{bestOffer?.discountPercent ? `${bestOffer.discountPercent}%` : '—'}</strong>
                <h2>Best available offer</h2>
                <p>{offers.length} verified dine-in offers to compare</p>
              </div>
              <div className="insight-item">
                <strong>{restaurant.canonicalRating ?? '—'}</strong>
                <h2>Tulya rating</h2>
                <p>{restaurant.canonicalRating == null ? 'Rating unavailable' : 'Tulya restaurant rating'}</p>
              </div>
              <div className="insight-item">
                <strong>{restaurant.cuisines?.[0] || restaurant.cuisine || '—'}</strong>
                <h2>Cuisine</h2>
                <p>{restaurant.cuisines?.length > 1 ? restaurant.cuisines.slice(1).join(', ') : 'Restaurant cuisine'}</p>
              </div>
              <div className="insight-location">
                <MapPin size={15} />
                <span>{restaurant.location || 'Location unavailable'}</span>
              </div>
              {demoProviders.some(({ id: providerId }) => restaurant.providerRatings?.[providerId] != null) ? (
                <div className="demo-ratings" aria-label="Provider ratings">
                  <strong>Provider ratings</strong>
                  {demoProviders.map(({ id: providerId, name }) => (
                    restaurant.providerRatings?.[providerId] != null ? (
                      <span key={providerId}>{name}: {restaurant.providerRatings[providerId]} ★</span>
                    ) : null
                  ))}
                </div>
              ) : null}
            </aside>
          </div>

          <section className="restaurant-detail-menu" aria-labelledby="restaurant-menu-heading">
            <div>
              <p className="eyebrow">From the kitchen</p>
              <h2 id="restaurant-menu-heading">Explore the menu</h2>
            </div>
            {menuCategories.length ? (
              <div className="restaurant-detail-menu-categories">
                {menuCategories.map((category) => (
                  <div key={category.name}>
                    <h3>{category.name}</h3>
                    <ul>{category.items.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                ))}
              </div>
            ) : menuLink ? (
              <a className="demo-provider-link" href={menuLink} target="_blank" rel="noreferrer">
                View full menu <ArrowUpRight size={14} />
              </a>
            ) : <p className="offer-terms">Menu unavailable</p>}
          </section>

          {carouselRestaurants.length > 1 ? (
            <section className="nearby-strip restaurant-detail-nearby" aria-label="Restaurant results">
              <div className="nearby-strip-heading">
                <div>
                  <p className="eyebrow">Restaurants to explore</p>
                  <h2>More nearby</h2>
                </div>
                <span>{carouselRestaurants.length} places</span>
              </div>
              <div className="nearby-list">
                {carouselRestaurants.map((item, index) => (
                  <Link
                    key={item.canonicalRestaurantId}
                    to={`/restaurants/${encodeURIComponent(item.canonicalRestaurantId)}`}
                    state={{ restaurant: item, restaurants: carouselRestaurants }}
                    className={`nearby-item${index === activeCarouselIndex ? ' nearby-item-active' : ''}`}
                    aria-current={index === activeCarouselIndex ? 'page' : undefined}
                    aria-label={`${item.name}, ${item.location || 'Bhubaneswar'}`}
                  >
                    {item.image ? <img src={item.image} alt="" loading="lazy" /> : (
                      <span className="nearby-image-empty" aria-hidden="true"><MapPin size={17} /></span>
                    )}
                    <span className="nearby-item-copy">
                      <strong>{item.name}</strong>
                      <small>{item.location || 'Bhubaneswar'}</small>
                    </span>
                    <span className="nearby-item-price">
                      {item.offers?.length ? 'Offers available' : 'No current offer'}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </Layout>
  );
}

export default RestaurantDetailPage;

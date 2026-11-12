import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  compareRestaurantOffers,
  discoverRestaurants,
  getRestaurantById,
  getRestaurantPhotoMatch,
  getSwiggyAddresses,
  getSwiggySession,
  searchSwiggyRestaurants,
  selectSwiggyAddress,
} from './services/api';
import App from './App';

vi.mock('./services/api', () => ({
  compareRestaurantOffers: vi.fn(),
  discoverRestaurants: vi.fn(),
  getRestaurantById: vi.fn(),
  getRestaurantPhotoMatch: vi.fn(),
  getSwiggyAddresses: vi.fn(),
  getSwiggySession: vi.fn(),
  searchSwiggyRestaurants: vi.fn(),
  selectSwiggyAddress: vi.fn(),
}));

const makeRestaurant = (id, name, rating, options = {}) => ({
  id: `google-place-${id}`,
  canonicalRestaurantId: `google:${id}`,
  providerId: id,
  name,
  rating,
  catalogueRating: rating,
  cuisines: options.cuisines || [],
  cuisine: options.cuisines?.[0] || null,
  category: options.category || 'restaurant',
  location: options.location || 'Bhubaneswar',
  address: options.address || `${options.location || 'Bhubaneswar'}, Odisha`,
  latitude: 20.2961 + rating / 1000,
  longitude: 85.8245,
  distance: options.distance ?? 2,
  image: `/api/v1/restaurants/photos?name=places%2F${id}%2Fphotos%2Fphoto`,
  photoAttributions: [],
  offers: [],
  dietary: { pureVeg: null, vegetarianFriendly: null },
});

const makeSwiggyRestaurant = (id, name, cuisine, distanceKm) => ({
  id,
  canonicalRestaurantId: `swiggy:${id}`,
  restaurantId: `swiggy:${id}`,
  providerRestaurantId: id,
  provider: 'swiggy',
  providerIds: { swiggy: id },
  name,
  cuisines: [cuisine],
  avgRating: 4.2,
  distanceKm,
});

const swiggyRestaurants = [
  makeSwiggyRestaurant('101', 'Lotus Courtyard', 'Biryani', 0.4),
  makeSwiggyRestaurant('102', 'Olive Garden Table', 'Italian', 1),
  makeSwiggyRestaurant('103', 'Saffron Room', 'North Indian', 2),
  makeSwiggyRestaurant('104', 'Coastal Kitchen', 'Seafood', 3),
  makeSwiggyRestaurant('105', 'Copper Leaf', 'Chinese', 4),
  makeSwiggyRestaurant('106', 'Sixth Table', 'Cafe', 5),
  makeSwiggyRestaurant('107', 'Seventh Table', 'Cafe', 6),
];

const pizzaRestaurants = [
  makeSwiggyRestaurant('201', 'Domino\'s Pizza', 'Pizzas', 1),
  makeSwiggyRestaurant('202', 'Laziz Pizza', 'Pizzas', 2),
];

const savedAddresses = (selectedId) => [
  { id: 'address-1', selected: selectedId === 'address-1' },
  { id: 'address-2', selected: selectedId === 'address-2' },
];

const nearbyRestaurants = [
  makeRestaurant('place-1', 'Lotus Courtyard', 4.9, { distance: 1 }),
  makeRestaurant('place-2', 'Olive Garden Table', 4.8, { distance: 2 }),
  makeRestaurant('place-3', 'Saffron Room', 4.7, { distance: 3 }),
  makeRestaurant('place-4', 'Coastal Kitchen', 4.6, { distance: 4 }),
  makeRestaurant('place-5', 'Copper Leaf', 4.5, { distance: 5 }),
];

const renderApp = (initialEntries = ['/']) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

const getNearbyNames = () => [...document.querySelectorAll('.nearby-item strong')]
  .map((element) => element.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: vi.fn((success) => success({
        coords: { latitude: 20.2961, longitude: 85.8245 },
      })),
    },
    permissions: {
      query: vi.fn().mockResolvedValue({ state: 'prompt' }),
    },
  });
  getSwiggySession.mockResolvedValue({ connected: true });
  getSwiggyAddresses.mockResolvedValue(savedAddresses('address-1'));
  selectSwiggyAddress.mockResolvedValue({ success: true, data: { selectedAddress: true } });
  searchSwiggyRestaurants.mockImplementation(async (query) => ({
    provider: 'swiggy',
    restaurants: query === 'restaurants' ? swiggyRestaurants : pizzaRestaurants,
  }));
  compareRestaurantOffers.mockResolvedValue({
    success: true,
    data: { results: [{ offers: [], providerStatuses: [] }] },
  });
  discoverRestaurants.mockResolvedValue({
    success: true,
    data: { location: 'Bhubaneswar', restaurants: nearbyRestaurants },
  });
  getRestaurantById.mockResolvedValue({
    success: true,
    data: nearbyRestaurants[0],
  });
  getRestaurantPhotoMatch.mockResolvedValue({
    success: true,
    data: { image: null, placeId: null, photoAttributions: [] },
  });
});

describe('Tulya restaurant catalogue and offer comparison', () => {
  it('loads the nearest five Swiggy restaurants on the homepage without calling Google discovery', async () => {
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Lotus Courtyard' })).toBeInTheDocument();
    expect(getSwiggySession).toHaveBeenCalled();
    expect(getSwiggyAddresses).toHaveBeenCalled();
    expect(searchSwiggyRestaurants).toHaveBeenCalledWith('restaurants', 'address-1');
    expect(getNearbyNames()).toEqual([
      'Lotus Courtyard',
      'Olive Garden Table',
      'Saffron Room',
      'Coastal Kitchen',
      'Copper Leaf',
    ]);
    expect(discoverRestaurants).not.toHaveBeenCalled();
    expect(screen.queryByText(/back shortly|temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it('renders Swiggy discovery on both routes and keeps the results heading on Restaurants only', async () => {
    const home = renderApp(['/']);
    await screen.findByRole('heading', { name: 'Lotus Courtyard' });
    expect(document.querySelector('.results-context')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    home.unmount();

    vi.clearAllMocks();
    renderApp(['/restaurants']);
    expect(await screen.findByRole('searchbox', { name: 'Find restaurants' })).toBeInTheDocument();
    expect(document.querySelector('.results-context')).toHaveTextContent('Restaurant discovery');
    expect(screen.getByRole('link', { name: 'Restaurants' })).toHaveAttribute('href', '/restaurants');
    expect(getSwiggySession).not.toHaveBeenCalled();
    expect(discoverRestaurants).not.toHaveBeenCalled();
  });

  it('offers reconnection when the Swiggy session is not connected', async () => {
    getSwiggySession.mockResolvedValue({ connected: false });
    renderApp();

    expect(await screen.findByRole('status')).toHaveTextContent('Restaurant search is not connected yet.');
    expect(screen.getByRole('link', { name: 'Enable restaurant search' }))
      .toHaveAttribute('href', 'http://localhost:4000/api/v1/swiggy/auth/start');
    expect(getSwiggyAddresses).not.toHaveBeenCalled();
    expect(searchSwiggyRestaurants).not.toHaveBeenCalled();
  });

  it('asks for a saved location, then selects it and searches nearby restaurants', async () => {
    getSwiggyAddresses.mockResolvedValue(savedAddresses(null));
    renderApp();

    expect((await screen.findAllByText('Choose a saved location to find nearby restaurants.')).length).toBeGreaterThan(0);
    expect(searchSwiggyRestaurants).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Select search area' }), {
      target: { value: 'address-2' },
    });

    expect(await screen.findByRole('heading', { name: 'Lotus Courtyard' })).toBeInTheDocument();
    expect(selectSwiggyAddress).toHaveBeenCalledWith('address-2');
    expect(searchSwiggyRestaurants).toHaveBeenCalledWith('restaurants', 'address-2');
  });

  it('searches Swiggy with the submitted query using the selected saved location', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Lotus Courtyard' });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find restaurants' }), {
      target: { value: 'pizza' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find restaurants' }));

    expect(await screen.findByRole('heading', { name: "Domino's Pizza" })).toBeInTheDocument();
    expect(searchSwiggyRestaurants).toHaveBeenLastCalledWith('pizza', 'address-1');
    expect(getNearbyNames()).toEqual(["Domino's Pizza", 'Laziz Pizza']);
    expect(discoverRestaurants).not.toHaveBeenCalled();
  });

  it('shows a clear error when Swiggy restaurant search fails', async () => {
    searchSwiggyRestaurants.mockRejectedValue(new Error('upstream failure'));
    renderApp();

    expect((await screen.findAllByText('Swiggy restaurant search could not be completed. Please try again.')).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole('searchbox', { name: 'Find restaurants' })).toBeInTheDocument();
  });

  it('lets users open a restaurant detail page directly by its canonical ID', async () => {
    renderApp(['/restaurants/google%3Aplace-1']);

    expect(await screen.findByRole('heading', { name: 'Lotus Courtyard' })).toBeInTheDocument();
    expect(getRestaurantById).toHaveBeenCalledWith('google:place-1');
    await waitFor(() => expect(screen.getByText('No current offer')).toBeInTheDocument());
  });

  it('uses restaurant- and locality-matched Google photos for detail pages', async () => {
    const basil = makeRestaurant('basil-photo-match', 'The Basil Cafe & Restro', 4.6, {
      location: 'Kalinga Nagar',
      address: 'Kalinga Nagar, Bhubaneswar, Odisha',
    });
    const pagoda = makeRestaurant('pagoda-photo-match', 'The Pagoda', 4.5, {
      location: 'Bhubaneswar',
      address: 'Bhubaneswar, Odisha',
    });
    getRestaurantById.mockImplementation(async (id) => ({
      success: true,
      data: id === 'google:basil-photo-match' ? { ...basil, image: null } : { ...pagoda, image: null },
    }));
    getRestaurantPhotoMatch.mockImplementation(async ({ name }) => ({
      success: true,
      data: {
        image: name.includes('Basil')
          ? '/api/v1/restaurants/photos?name=places/basil/photos/photo'
          : '/api/v1/restaurants/photos?name=places/pagoda/photos/photo',
        placeId: name.includes('Basil') ? 'basil-place' : 'pagoda-place',
        photoAttributions: [],
      },
    }));

    const basilPage = renderApp(['/restaurants/google%3Abasil-photo-match']);
    await screen.findByRole('heading', { name: 'The Basil Cafe & Restro' });
    await waitFor(() => expect(document.querySelector('.restaurant-detail-backdrop').style.backgroundImage)
      .toContain('places/basil/photos/photo'));
    expect(getRestaurantPhotoMatch).toHaveBeenCalledWith(expect.objectContaining({
      name: 'The Basil Cafe & Restro',
      location: 'Kalinga Nagar',
      googlePlaceId: 'basil-photo-match',
    }));
    basilPage.unmount();

    renderApp(['/restaurants/google%3Apagoda-photo-match']);
    await screen.findByRole('heading', { name: 'The Pagoda' });
    await waitFor(() => expect(document.querySelector('.restaurant-detail-backdrop').style.backgroundImage)
      .toContain('places/pagoda/photos/photo'));
  });
});

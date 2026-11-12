import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMock = vi.hoisted(() => {
  const client = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  };
  const state = { config: null };
  return {
    client,
    state,
    create: vi.fn((config) => {
      state.config = config;
      return client;
    }),
  };
});

vi.mock('axios', () => ({
  default: { create: axiosMock.create },
}));

import api, {
  compareRestaurantOffers,
  getSwiggyAddresses,
  getSwiggySession,
  selectSwiggyAddress,
  searchSwiggyRestaurants,
} from './api';

describe('credentialed backend API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the browser session cookie with authenticated comparison requests', async () => {
    axiosMock.client.post.mockResolvedValue({
      data: { success: true, data: { results: [] } },
    });

    await compareRestaurantOffers({ id: 'catalog-restaurant', name: 'Sample Restaurant' });

    expect(axiosMock.state.config).toEqual(expect.objectContaining({
      withCredentials: true,
    }));
    expect(axiosMock.client.post).toHaveBeenCalledWith(
      '/compare',
      { mode: 'dine-in', restaurant: { id: 'catalog-restaurant', name: 'Sample Restaurant' } },
      { timeout: 25000 },
    );
    expect(api).toBe(axiosMock.client);
  });

  it('passes validated browser location to the comparison endpoint without changing the restaurant payload', async () => {
    axiosMock.client.post.mockResolvedValue({
      data: { success: true, data: { results: [] } },
    });
    const restaurant = { id: 'swiggy:944207', name: 'Beyrut Classy Dine' };
    const userLocation = { latitude: 12.9352, longitude: 77.6245 };

    await compareRestaurantOffers(restaurant, userLocation);

    expect(axiosMock.client.post).toHaveBeenCalledWith(
      '/compare',
      { mode: 'dine-in', restaurant, userLocation },
      { timeout: 25000 },
    );
  });

  it('uses the explicit search area for the catalogue and defaults offer comparison to dine-in', async () => {
    axiosMock.client.get
      .mockResolvedValueOnce({ data: { data: { connected: true, selectedAddress: true } } })
      .mockResolvedValueOnce({
        data: { data: { addresses: [{ id: 'selected-address-id', selected: true }] } },
      });
    axiosMock.client.put.mockResolvedValue({ data: { success: true } });
    axiosMock.client.post
      .mockResolvedValueOnce({
        data: { data: { restaurants: [{ providerRestaurantId: 'provider-restaurant-id' }] } },
      });

    const session = await getSwiggySession();
    const addresses = await getSwiggyAddresses();
    await selectSwiggyAddress(addresses[0].id);
    const search = await searchSwiggyRestaurants('pizza', addresses[0].id);

    expect(session).toMatchObject({ connected: true, selectedAddress: true });
    expect(addresses).toEqual([{ id: 'selected-address-id', selected: true }]);
    expect(axiosMock.client.put).toHaveBeenCalledWith('/swiggy/address', {
      addressId: 'selected-address-id',
    });
    expect(search.restaurants).toEqual([{ providerRestaurantId: 'provider-restaurant-id' }]);
    expect(axiosMock.client.post).toHaveBeenNthCalledWith(1, '/swiggy/restaurants/search', {
      addressId: 'selected-address-id',
      query: 'pizza',
    });
    await compareRestaurantOffers({
      id: 'swiggy:provider-restaurant-id',
      canonicalRestaurantId: 'swiggy:provider-restaurant-id',
      name: 'Pizza Place',
      providerIds: { swiggy: 'provider-restaurant-id' },
    });
    expect(axiosMock.client.post).toHaveBeenNthCalledWith(
      2,
      '/compare',
      {
        mode: 'dine-in',
        restaurant: {
          id: 'swiggy:provider-restaurant-id',
          canonicalRestaurantId: 'swiggy:provider-restaurant-id',
          name: 'Pizza Place',
          providerIds: { swiggy: 'provider-restaurant-id' },
        },
      },
      { timeout: 25000 },
    );
  });
});

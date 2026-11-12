import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const swiggySession = vi.hoisted(() => ({
  createClient: vi.fn(),
  getStatus: vi.fn(),
  getSelectedAddressId: vi.fn(),
  rememberAddresses: vi.fn(),
  selectAddress: vi.fn(),
}));

const swiggySessionStore = vi.hoisted(() => ({
  get: vi.fn(),
  getOrCreate: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../src/providers/swiggyOAuthSession.js', () => ({
  swiggyOAuthSessionStore: swiggySessionStore,
}));

const originalNodeEnvironment = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';
const { default: app } = await import('../src/app.js');
if (originalNodeEnvironment === undefined) {
  delete process.env.NODE_ENV;
} else {
  process.env.NODE_ENV = originalNodeEnvironment;
}

describe('Tulya Swiggy restaurant catalogue routes', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    swiggySessionStore.get.mockReturnValue(null);
    swiggySessionStore.getOrCreate.mockReturnValue(swiggySession);
    client = {
      getAddresses: vi.fn(),
      searchRestaurants: vi.fn(),
    };
    swiggySession.createClient.mockReturnValue(client);
    swiggySession.getSelectedAddressId.mockReturnValue('opaque-address-id');
    swiggySession.rememberAddresses.mockReturnValue([{ id: 'opaque-address-id' }]);
  });

  it('selects only an authenticated address ID and returns no address text', async () => {
    const selection = await request(app)
      .put('/api/v1/swiggy/address')
      .send({ addressId: 'opaque-address-id' });

    expect(selection.status).toBe(200);
    expect(swiggySession.selectAddress).toHaveBeenCalledWith('opaque-address-id');

    client.getAddresses.mockResolvedValue({
      addresses: [{ id: 'opaque-address-id' }],
      pagination: null,
    });
    const addresses = await request(app).get('/api/v1/swiggy/addresses?page=1');

    expect(addresses.status).toBe(200);
    expect(addresses.body.data.addresses).toEqual([{ id: 'opaque-address-id', selected: true }]);
    expect(JSON.stringify(addresses.body)).not.toContain('private fixture value');
  });

  it('validates and forwards official search_restaurants arguments', async () => {
    client.searchRestaurants.mockResolvedValue({
      restaurants: [{
        id: 'provider-restaurant-id',
        name: 'Sample Restaurant',
        areaName: 'Central District',
        address: '12 Market Road',
        phone: '+91-0000000000',
        cuisines: ['Indian'],
        avgRating: 4.5,
        imageUrl: 'https://images.swiggy.com/provider-image',
        availabilityStatus: 'OPEN',
      }],
      nextOffset: 10,
      hasMore: true,
    });
    const response = await request(app)
      .post('/api/v1/swiggy/restaurants/search')
      .send({
        addressId: 'opaque-address-id',
        query: 'Sample Restaurant',
        offset: 0,
      });

    expect(response.status).toBe(200);
    expect(client.searchRestaurants).toHaveBeenCalledWith({
      addressId: 'opaque-address-id',
      query: 'Sample Restaurant',
      offset: 0,
    });
    expect(response.body.data.restaurants[0]).toMatchObject({
      provider: 'swiggy',
      id: 'provider-restaurant-id',
      canonicalRestaurantId: 'swiggy:provider-restaurant-id',
      restaurantId: 'swiggy:provider-restaurant-id',
      providerRestaurantId: 'provider-restaurant-id',
      providerIds: { swiggy: 'provider-restaurant-id' },
      imageUrl: 'https://images.swiggy.com/provider-image',
      availabilityStatus: 'OPEN',
    });
    expect(response.body.data).not.toHaveProperty('addressId');

    const missingQuery = await request(app)
      .post('/api/v1/swiggy/restaurants/search')
      .send({ addressId: 'opaque-address-id' });
    expect(missingQuery.status).toBe(400);
  });

  it('requires the selected location before searching restaurants', async () => {
    const mismatchedAddress = await request(app)
      .post('/api/v1/swiggy/restaurants/search')
      .send({ addressId: 'another-address-id', query: 'Sample Restaurant' });
    expect(mismatchedAddress.status).toBe(400);
    expect(client.searchRestaurants).not.toHaveBeenCalled();

    const removedFoodCoupons = await request(app)
      .post('/api/v1/swiggy/restaurants/provider-restaurant-id/coupons')
      .send({ addressId: 'opaque-address-id' });
    expect(removedFoodCoupons.status).toBe(404);
  });

  it('returns safe authentication and MCP errors', async () => {
    swiggySession.createClient.mockReturnValue(null);
    const disconnected = await request(app)
      .post('/api/v1/swiggy/restaurants/search')
      .send({ addressId: 'opaque-address-id', query: 'Sample Restaurant' });
    expect(disconnected.status).toBe(401);
    expect(disconnected.body.message).toMatch(/authorize again/);

    swiggySession.createClient.mockReturnValue(client);
    client.searchRestaurants.mockRejectedValue(new Error('upstream detail'));
    const upstreamFailure = await request(app)
      .post('/api/v1/swiggy/restaurants/search')
      .send({ addressId: 'opaque-address-id', query: 'Sample Restaurant' });
    expect(upstreamFailure.status).toBe(502);
    expect(upstreamFailure.body.message).not.toContain('upstream detail');

    client.searchRestaurants.mockRejectedValue(Object.assign(new Error('private MCP session detail'), {
      statusCode: 419,
    }));
    const expired = await request(app)
      .post('/api/v1/swiggy/restaurants/search')
      .send({ addressId: 'opaque-address-id', query: 'Sample Restaurant' });
    expect(expired.status).toBe(401);
    expect(expired.body.message).toMatch(/authorize again/);
    expect(expired.body.message).not.toContain('private MCP session detail');

    client.searchRestaurants.mockRejectedValue(Object.assign(new Error('private access detail'), {
      statusCode: 403,
    }));
    const forbidden = await request(app)
      .post('/api/v1/swiggy/restaurants/search')
      .send({ addressId: 'opaque-address-id', query: 'Sample Restaurant' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.message).toMatch(/not enabled/);
    expect(forbidden.body.message).not.toContain('private access detail');
  });
});

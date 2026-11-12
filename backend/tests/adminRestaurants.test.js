import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { env } from '../src/config/env.js';

const adminKey = 'restaurant-admin-test-key-that-is-long-enough';

afterEach(() => {
  delete env.RESTAURANT_ADMIN_API_KEY;
});

describe('Restaurant administration API', () => {
  it('fails closed when admin credentials are missing or incorrect', async () => {
    const unconfigured = await request(app).get('/api/v1/admin/restaurants');
    env.RESTAURANT_ADMIN_API_KEY = adminKey;
    const unauthorized = await request(app)
      .get('/api/v1/admin/restaurants')
      .set('X-Admin-Key', 'incorrect');

    expect(unconfigured.status).toBe(503);
    expect(unauthorized.status).toBe(401);
  });

  it('creates, updates, lists, and deletes catalog restaurants with the admin key', async () => {
    env.RESTAURANT_ADMIN_API_KEY = adminKey;
    const restaurant = {
      id: 'admin-api-test-restaurant',
      name: 'Admin API Test Restaurant',
      cuisines: ['Japanese'],
      location: { city: 'Bengaluru', address: 'Test Road' },
      menu: [{ id: 'miso-soup', name: 'Miso Soup', price: 120 }],
    };
    const create = await request(app)
      .post('/api/v1/admin/restaurants')
      .set('X-Admin-Key', adminKey)
      .send(restaurant);
    const update = await request(app)
      .put(`/api/v1/admin/restaurants/${restaurant.id}`)
      .set('X-Admin-Key', adminKey)
      .send({ name: 'Updated Test Restaurant' });
    const listing = await request(app)
      .get('/api/v1/admin/restaurants')
      .set('X-Admin-Key', adminKey);
    const detail = await request(app).get(`/api/v1/restaurants/${restaurant.id}`);
    const removal = await request(app)
      .delete(`/api/v1/admin/restaurants/${restaurant.id}`)
      .set('X-Admin-Key', adminKey);

    expect(create.status).toBe(201);
    expect(create.body.data.offers).toEqual([]);
    expect(update.status).toBe(200);
    expect(detail.body.data.name).toBe('Updated Test Restaurant');
    expect(listing.body.data.some(({ id }) => id === restaurant.id)).toBe(true);
    expect(removal.body.data.deleted).toBe(true);
  });

  it('rejects client-supplied provider offers and empty updates', async () => {
    env.RESTAURANT_ADMIN_API_KEY = adminKey;
    const forgedOffer = await request(app)
      .post('/api/v1/admin/restaurants')
      .set('X-Admin-Key', adminKey)
      .send({
        id: 'forged-offer-restaurant',
        name: 'Forged Offer Restaurant',
        offers: [{ provider: 'swiggy', isVerified: true, finalPrice: 1 }],
      });
    const emptyUpdate = await request(app)
      .put('/api/v1/admin/restaurants/abc-restaurant')
      .set('X-Admin-Key', adminKey)
      .send({});

    expect(forgedOffer.status).toBe(400);
    expect(emptyUpdate.status).toBe(400);
  });
});

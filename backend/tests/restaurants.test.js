import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Tulya restaurant endpoints', () => {
  it('does not expose seeded catalogue data through the legacy list endpoint', async () => {
    const response = await request(app).get('/api/v1/restaurants').query({
      location: 'Koramangala',
      budget: 1500,
      mode: 'dine-in',
    });

    expect(response.status).toBe(410);
    expect(response.body.message).toBe('Restaurant discovery requires an authenticated search area');
  });

  it('returns the restaurant detail for a valid id', async () => {
    const response = await request(app).get('/api/v1/restaurants/abc-restaurant');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('ABC Restaurant');
  });

  it('returns menu items for a restaurant', async () => {
    const response = await request(app).get('/api/v1/restaurants/abc-restaurant/menu');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0].name).toBe('Paneer Tikka');
  });

  it('returns offers for a restaurant', async () => {
    const response = await request(app).get('/api/v1/restaurants/saffron-bite/offers');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(0);
    expect(response.body.meta.providerStatuses).toEqual([
      expect.objectContaining({ provider: 'swiggy_dineout', status: 'unavailable' }),
      expect.objectContaining({ provider: 'zomato', status: 'unavailable' }),
      expect.objectContaining({ provider: 'eazydiner', status: 'unavailable' }),
    ]);
  });

  it('does not enable Google/sample discovery for coordinate-based requests', async () => {
    const response = await request(app).get('/api/v1/restaurants').query({
      latitude: 12.9352,
      distance: 5,
    });

    expect(response.status).toBe(410);
    expect(response.body.message).toBe('Restaurant discovery requires an authenticated search area');
  });

  it('rejects a discovery request that contains only one coordinate', async () => {
    const response = await request(app)
      .post('/api/v1/restaurants/discover')
      .send({ query: 'Chinese', latitude: 20.3 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid restaurant discovery request');
  });

  it('rejects invalid provider photo references before proxying', async () => {
    const response = await request(app)
      .get('/api/v1/restaurants/photos')
      .query({ name: 'https://example.com/image.jpg' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid restaurant photo reference');
  });

  it('rejects incomplete photo-match coordinates before calling Google Places', async () => {
    const response = await request(app)
      .post('/api/v1/restaurants/photos/match')
      .send({ name: 'The Pagoda', location: 'Bhubaneswar', latitude: 20.3 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid restaurant photo match request');
  });
});

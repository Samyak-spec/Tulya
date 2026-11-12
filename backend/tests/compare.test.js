import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Tulya comparison endpoints', () => {
  it('returns ranked restaurant comparisons for a valid request', async () => {
    const response = await request(app).post('/api/v1/compare').send({
      mode: 'dine-in',
      location: 'Koramangala',
      people: 2,
      budget: 1500,
      cuisine: ['Indian'],
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.results)).toBe(true);
    expect(response.body.data.results.length).toBeGreaterThan(0);
    expect(response.body.data.results[0].bestOffer).toBeNull();
    expect(response.body.data.results[0].offers).toHaveLength(0);
    expect(response.body.data.results[0].providerStatuses).toEqual([
      expect.objectContaining({ provider: 'swiggy_dineout', status: 'unavailable' }),
      expect.objectContaining({ provider: 'zomato', status: 'unavailable' }),
      expect.objectContaining({ provider: 'eazydiner', status: 'unavailable' }),
    ]);
  });

  it('accepts validated browser coordinates for the Dineout comparison provider', async () => {
    const response = await request(app).post('/api/v1/compare').send({
      mode: 'dine-in',
      userLocation: { latitude: 12.9352, longitude: 77.6245 },
      restaurant: {
        id: 'swiggy:944207',
        name: 'Beyrut Classy Dine',
        providerIds: { swiggyFood: '944207' },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0].providerStatuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'swiggy_dineout', status: 'unavailable' }),
    ]));
  });

  it('rejects invalid browser coordinates', async () => {
    const response = await request(app).post('/api/v1/compare').send({
      userLocation: { latitude: 91, longitude: 77 },
      restaurant: { id: 'swiggy:944207', name: 'Beyrut Classy Dine' },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid comparison request');
  });

  it('matches a selected live restaurant and ranks only verified provider offers', async () => {
    const response = await request(app).post('/api/v1/compare').send({
      restaurant: {
        id: 'google-place-live-1',
        providerId: 'live-1',
        name: 'Midnight Spice',
        location: '12 Market Road, Bengaluru',
        latitude: 12.9352,
        longitude: 77.6245,
        offers: [{
          provider: 'zomato',
          originalPrice: 1100,
          discount: 900,
          finalPrice: 200,
          offerText: 'untrusted body data',
          isVerified: true,
        }],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.results).toHaveLength(1);
    expect(response.body.data.results[0]).toMatchObject({
      restaurantId: 'google-place-live-1',
      bestOffer: null,
      offers: [],
    });
  });

  it('rejects invalid comparison payloads', async () => {
    const response = await request(app).post('/api/v1/compare').send({
      budget: -10,
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Invalid comparison request');
  });
});

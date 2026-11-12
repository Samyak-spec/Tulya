import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Tulya legacy restaurant search endpoint', () => {
  it('does not fall back to Google Places or seeded restaurants', async () => {
    const response = await request(app).post('/api/v1/ai/search').send({
      query: 'North Indian dine in for 2 under ₹1,500',
      latitude: 12.9352,
      longitude: 77.6245,
    });

    expect(response.status).toBe(410);
    expect(response.body.message).toBe('Use authenticated restaurant catalogue search for discovery');
    expect(response.body.data).toBeUndefined();
  });
});

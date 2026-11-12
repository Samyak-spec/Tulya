import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Authenticated restaurant interactions and recommendations', () => {
  it('records only catalog restaurant interactions and ranks from user preferences/activity', async () => {
    const registration = await request(app).post('/api/v1/auth/register').send({
      name: 'Recommendation Member',
      email: 'recommendation-member@example.com',
      password: 'long-enough-password',
    });
    const authorization = `Bearer ${registration.body.data.token}`;
    const unauthenticated = await request(app).get('/api/v1/users/me/recommendations');
    const preferences = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set('Authorization', authorization)
      .send({ cuisinePreferences: ['Chinese'] });
    const interaction = await request(app)
      .post('/api/v1/users/me/interactions')
      .set('Authorization', authorization)
      .send({ restaurantId: 'midnight-spice', event: 'offer_click' });
    const recommendations = await request(app)
      .get('/api/v1/users/me/recommendations?limit=5')
      .set('Authorization', authorization);

    expect(unauthenticated.status).toBe(401);
    expect(preferences.status).toBe(200);
    expect(interaction.status).toBe(201);
    expect(recommendations.status).toBe(200);
    expect(recommendations.body.data[0]).toMatchObject({
      id: 'midnight-spice',
      recommendationScore: expect.any(Number),
    });
    expect(recommendations.body.data[0].recommendationReason)
      .toContain('preferences and recent activity');
  });

  it('rejects invalid interaction events and unknown restaurants', async () => {
    const registration = await request(app).post('/api/v1/auth/register').send({
      name: 'Interaction Member',
      email: 'interaction-member@example.com',
      password: 'long-enough-password',
    });
    const authorization = `Bearer ${registration.body.data.token}`;
    const invalid = await request(app)
      .post('/api/v1/users/me/interactions')
      .set('Authorization', authorization)
      .send({ restaurantId: 'abc-restaurant', event: 'search', query: 'private search' });
    const unknown = await request(app)
      .post('/api/v1/users/me/interactions')
      .set('Authorization', authorization)
      .send({ restaurantId: 'not-in-catalog', event: 'view' });

    expect(invalid.status).toBe(400);
    expect(unknown.status).toBe(404);
  });
});

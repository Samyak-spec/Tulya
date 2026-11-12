import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Tulya user preferences and favorites', () => {
  it('updates validated preferences and manages catalog favorites for the signed-in user', async () => {
    const registration = await request(app).post('/api/v1/auth/register').send({
      name: 'Tulya Member',
      email: 'tulya-member@example.com',
      password: 'long-enough-password',
    });
    const token = registration.body.data.token;
    const authorization = `Bearer ${token}`;

    const update = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set('Authorization', authorization)
      .send({
        cuisinePreferences: ['North Indian'],
        dietaryPreferences: ['vegetarian'],
        budgetPreferences: [1200],
      });
    const favorite = await request(app)
      .post('/api/v1/users/me/favorites/abc-restaurant')
      .set('Authorization', authorization);
    const favorites = await request(app)
      .get('/api/v1/users/me/favorites')
      .set('Authorization', authorization);
    const removal = await request(app)
      .delete('/api/v1/users/me/favorites/abc-restaurant')
      .set('Authorization', authorization);
    const afterRemoval = await request(app)
      .get('/api/v1/users/me/favorites')
      .set('Authorization', authorization);

    expect(registration.status).toBe(201);
    expect(registration.body.data.user).not.toHaveProperty('passwordHash');
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({
      cuisinePreferences: ['North Indian'],
      dietaryPreferences: ['vegetarian'],
      budgetPreferences: [1200],
    });
    expect(favorite.status).toBe(201);
    expect(favorites.body.data.map((restaurant) => restaurant.id)).toEqual(['abc-restaurant']);
    expect(removal.body.data.removed).toBe(true);
    expect(afterRemoval.body.data).toEqual([]);
  });

  it('rejects unauthenticated and invalid preference requests', async () => {
    const unauthenticated = await request(app)
      .get('/api/v1/users/me/preferences');
    const registration = await request(app).post('/api/v1/auth/register').send({
      name: 'Preference Test',
      email: 'preference-test@example.com',
      password: 'long-enough-password',
    });
    const invalid = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set('Authorization', `Bearer ${registration.body.data.token}`)
      .send({ budgetPreferences: [-1] });

    expect(unauthenticated.status).toBe(401);
    expect(invalid.status).toBe(400);
  });
});

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('FoodAI auth endpoints', () => {
  it('registers a user and returns a token', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      location: 'Bengaluru',
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('test@example.com');
    expect(response.body.data.token).toBeTruthy();
  });

  it('logs in an existing user', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('test@example.com');
  });

  it('returns the current user for a valid auth token', async () => {
    const registerResponse = await request(app).post('/api/v1/auth/register').send({
      name: 'Another User',
      email: 'another@example.com',
      password: 'password123',
      location: 'Bengaluru',
    });

    const token = registerResponse.body.data.token;
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe('another@example.com');
  });
});

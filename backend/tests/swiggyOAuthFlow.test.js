import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const dependencies = vi.hoisted(() => ({
  fetchImpl: vi.fn(),
}));

vi.mock('../src/providers/swiggyOAuthSession.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    swiggyOAuthSessionStore: actual.createSwiggyOAuthSessionStore({
      createSession: () => actual.createSwiggyOAuthSession({
        fetchImpl: dependencies.fetchImpl,
      }),
    }),
  };
});

const response = (payload, status = 200, headers = {}) => new Response(
  payload === null ? null : JSON.stringify(payload),
  {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  },
);

const tools = [
  {
    name: 'get_addresses',
    inputSchema: { properties: { page: {}, pageSize: {} }, required: ['page', 'pageSize'] },
  },
];

describe('Swiggy OAuth browser session flow', () => {
  let app;
  let authenticatedCookie;

  beforeAll(async () => {
    const originalNodeEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    ({ default: app } = await import('../src/app.js'));
    if (originalNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnvironment;
    }
  });

  it('keeps OAuth callback authentication and address selection in the browser session cookie', async () => {
    dependencies.fetchImpl.mockImplementation(async (input, options = {}) => {
      const url = new URL(input.toString());
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        return response({
          authorization_endpoint: 'https://mcp.swiggy.com/auth/authorize',
          token_endpoint: 'https://mcp.swiggy.com/auth/token',
          registration_endpoint: 'https://mcp.swiggy.com/auth/register',
        });
      }
      if (url.pathname === '/auth/register') return response({ client_id: 'test-client-id' });
      if (url.pathname === '/auth/token') {
        return response({ access_token: 'server-only-test-token', token_type: 'Bearer', expires_in: 3600 });
      }

      const mcpRequest = JSON.parse(options.body);
      if (mcpRequest.method === 'initialize') {
        return response({ jsonrpc: '2.0', id: mcpRequest.id, result: {} }, 200, {
          'Mcp-Session-Id': `session-${mcpRequest.id}`,
        });
      }
      if (mcpRequest.method === 'notifications/initialized') return response(null, 202);
      if (mcpRequest.method === 'tools/list') {
        return response({ jsonrpc: '2.0', id: mcpRequest.id, result: { tools } });
      }
      return response({
        jsonrpc: '2.0',
        id: mcpRequest.id,
        result: {
          structuredContent: {
            success: true,
            data: {
              addresses: [{ id: 'authenticated-address-id' }],
              pagination: { page: 1 },
            },
          },
        },
      });
    });

    const authorizationStart = await request(app)
      .get('/api/v1/swiggy/auth/start')
      .expect(302);
    const authorizationUrl = new URL(authorizationStart.headers.location);
    const setCookie = authorizationStart.headers['set-cookie'][0];
    const sessionCookie = setCookie.split(';', 1)[0];
    authenticatedCookie = sessionCookie.slice(sessionCookie.indexOf('=') + 1);

    expect(setCookie).toMatch(/^tulya_swiggy_session=[A-Za-z0-9_-]{43}; HttpOnly;/);
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/api/v1');
    expect(setCookie).not.toMatch(/;\s*Domain=/i);
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');

    const callback = await request(app)
      .get('/api/v1/swiggy/auth/callback')
      .set('Cookie', sessionCookie)
      .query({
        code: 'test-authorization-code',
        state: authorizationUrl.searchParams.get('state'),
      })
      .expect(200);

    expect(callback.text).toContain('Restaurant search is connected');
    expect(callback.text).not.toContain('server-only-test-token');

    const addresses = await request(app)
      .get('/api/v1/swiggy/addresses?page=1')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(addresses.body).toMatchObject({
      success: true,
      data: { addresses: [{ id: 'authenticated-address-id', selected: false }] },
    });
    expect(JSON.stringify(addresses.body)).not.toContain('server-only-test-token');

    const selection = await request(app)
      .put('/api/v1/swiggy/address')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:4000')
      .send({ addressId: 'authenticated-address-id' })
      .expect(200);
    expect(selection.body).toEqual({ success: true, data: { selectedAddress: true } });
    expect(addresses.headers['set-cookie']).toBeUndefined();
    expect(selection.headers['set-cookie']).toBeUndefined();

    const session = await request(app)
      .get('/api/v1/swiggy/session')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(session.body.data).toMatchObject({ connected: true, selectedAddress: true });
    expect(JSON.stringify(session.body)).not.toContain('server-only-test-token');
    expect(dependencies.fetchImpl.mock.calls
      .filter(([, options]) => options?.body && JSON.parse(options.body).method === 'tools/call'))
      .toHaveLength(1);

    const separateBrowser = await request(app)
      .get('/api/v1/swiggy/addresses?page=1')
      .expect(401);
    expect(separateBrowser.body.success).toBe(false);
  });

  it('accepts quoted or URL-encoded session-cookie values without creating another session', async () => {
    const status = await request(app)
      .get('/api/v1/swiggy/session')
      .set('Cookie', `other=value; tulya_swiggy_session="${encodeURIComponent(authenticatedCookie)}"`)
      .expect(200);

    expect(status.body.data).toMatchObject({ connected: true, selectedAddress: true });
    expect(status.headers['set-cookie']).toBeUndefined();
  });
});

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createSwiggyOAuthSession } from '../src/providers/swiggyOAuthSession.js';

const response = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('Swiggy OAuth 2.1 + PKCE local session', () => {
  it('dynamically registers, starts S256 authorization and exchanges the callback code server-side', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        authorization_endpoint: 'https://mcp.swiggy.com/auth/authorize',
        token_endpoint: 'https://mcp.swiggy.com/auth/token',
        registration_endpoint: 'https://mcp.swiggy.com/auth/register',
      }))
      .mockResolvedValueOnce(response({ client_id: 'dcr-client-id' }))
      .mockResolvedValueOnce(response({
        access_token: 'opaque-test-token',
        token_type: 'Bearer',
        expires_in: 432000,
        scope: 'mcp:tools',
      }));
    const session = createSwiggyOAuthSession({ fetchImpl });

    const authorization = new URL(await session.startAuthorization());
    const registration = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(authorization.origin).toBe('https://mcp.swiggy.com');
    expect(authorization.pathname).toBe('/auth/authorize');
    expect(authorization.searchParams.get('response_type')).toBe('code');
    expect(authorization.searchParams.get('client_id')).toBe('dcr-client-id');
    expect(authorization.searchParams.get('redirect_uri'))
      .toBe('http://localhost:4000/api/v1/swiggy/auth/callback');
    expect(authorization.searchParams.get('scope')).toBe('mcp:tools');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(registration).toMatchObject({
      client_name: 'Tulya Local Development',
      redirect_uris: ['http://localhost:4000/api/v1/swiggy/auth/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });

    await session.completeAuthorization({
      code: 'single-use-auth-code',
      state: authorization.searchParams.get('state'),
    });
    const tokenExchange = JSON.parse(fetchImpl.mock.calls[2][1].body);
    expect(tokenExchange).toMatchObject({
      grant_type: 'authorization_code',
      code: 'single-use-auth-code',
      redirect_uri: 'http://localhost:4000/api/v1/swiggy/auth/callback',
    });
    expect(tokenExchange.code_verifier).toBeTruthy();
    expect(createHash('sha256').update(tokenExchange.code_verifier).digest('base64url'))
      .toBe(authorization.searchParams.get('code_challenge'));
    expect(session.getStatus()).toMatchObject({
      connected: true,
      selectedAddress: false,
    });
    expect(session.getStatus()).not.toHaveProperty('accessToken');
    expect(fetchImpl.mock.calls[2][1].headers.Authorization).toBeUndefined();
  });

  it('rejects replayed or unknown OAuth state and expires pending authorization attempts', async () => {
    let time = 1_000;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        authorization_endpoint: 'https://mcp.swiggy.com/auth/authorize',
        token_endpoint: 'https://mcp.swiggy.com/auth/token',
        registration_endpoint: 'https://mcp.swiggy.com/auth/register',
      }))
      .mockResolvedValueOnce(response({ client_id: 'dcr-client-id' }));
    const session = createSwiggyOAuthSession({ fetchImpl, now: () => time });
    const authorization = new URL(await session.startAuthorization());
    time += 10 * 60 * 1000;

    await expect(session.completeAuthorization({
      code: 'code',
      state: authorization.searchParams.get('state'),
    })).rejects.toThrow(/invalid or expired/);
    await expect(session.completeAuthorization({ code: 'code', state: 'unissued' }))
      .rejects.toThrow(/invalid or expired/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects OAuth metadata pointing outside the official Swiggy origin', async () => {
    const session = createSwiggyOAuthSession({
      fetchImpl: vi.fn().mockResolvedValueOnce(response({
        authorization_endpoint: 'https://attacker.example/auth/authorize',
        token_endpoint: 'https://mcp.swiggy.com/auth/token',
        registration_endpoint: 'https://mcp.swiggy.com/auth/register',
      })),
    });

    await expect(session.startAuthorization()).rejects.toThrow(/unexpected endpoint/);
  });

  it('connects OAuth, selects a search location and searches the official restaurant catalogue', async () => {
    const tools = [
      {
        name: 'get_addresses',
        inputSchema: { properties: { page: {}, pageSize: {} }, required: ['page', 'pageSize'] },
      },
      {
        name: 'search_restaurants',
        inputSchema: { properties: { addressId: {}, query: {} }, required: ['addressId', 'query'] },
      },
    ];
    const fetchImpl = vi.fn(async (input, options = {}) => {
      const url = new URL(input.toString());
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        return response({
          authorization_endpoint: 'https://mcp.swiggy.com/auth/authorize',
          token_endpoint: 'https://mcp.swiggy.com/auth/token',
          registration_endpoint: 'https://mcp.swiggy.com/auth/register',
        });
      }
      if (url.pathname === '/auth/register') return response({ client_id: 'dcr-client-id' });
      if (url.pathname === '/auth/token') {
        return response({ access_token: 'opaque-test-token', token_type: 'Bearer', expires_in: 432000 });
      }
      if (url.pathname === '/auth/logout') return response({ success: true });
      const request = JSON.parse(options.body);
      if (request.method === 'initialize') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }), {
          headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': `session-${request.id}` },
        });
      }
      if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (request.method === 'tools/list') {
        const serverTools = url.pathname === '/dineout'
          ? [{
            name: 'get_saved_locations',
            inputSchema: { properties: {} },
          }]
          : tools;
        return response({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: serverTools },
        }, 200);
      }
      const toolName = request.params.name;
      const data = toolName === 'get_addresses'
        ? { addresses: [{ id: 'opaque-address-id', addressLine: '45 Sample Road', phoneNumber: 'private' }] }
        : toolName === 'get_saved_locations'
          ? { locations: [{ id: 'dineout-address-id', addressLine: '45 Sample Road', phoneNumber: 'private' }] }
          : {
          restaurants: [{
            id: 'swiggy-restaurant-9',
            name: 'Midnight Spice',
            areaName: 'Sample District',
            availabilityStatus: 'OPEN',
          }],
        };
      return response({
        jsonrpc: '2.0',
        id: request.id,
        result: { structuredContent: { success: true, data } },
      });
    });
    const session = createSwiggyOAuthSession({ fetchImpl });
    const authorization = new URL(await session.startAuthorization());
    await session.completeAuthorization({
      code: 'authorization-code',
      state: authorization.searchParams.get('state'),
    });
    const client = session.createClient();
    const addressResult = await client.getAddresses();
    const visibleAddresses = session.rememberAddresses(addressResult.addresses);
    session.selectAddress(visibleAddresses[0].id);
    const searchedRestaurants = await client.searchRestaurants({
      addressId: visibleAddresses[0].id,
      query: 'Midnight Spice',
    });
    const dineoutLocations = await session.createDineoutClient().getSavedLocations();
    expect(visibleAddresses).toEqual([{ id: 'opaque-address-id' }]);
    expect(session.getSelectedAddress()).toEqual({
      id: 'opaque-address-id',
      addressLine: '45 Sample Road',
    });
    expect(dineoutLocations.data.locations[0].id).toBe('dineout-address-id');
    const foodAuthorization = fetchImpl.mock.calls
      .find(([input]) => new URL(input.toString()).pathname === '/food')[1].headers.Authorization;
    const dineoutCalls = fetchImpl.mock.calls
      .filter(([input]) => new URL(input.toString()).pathname === '/dineout');
    expect(dineoutCalls.length).toBeGreaterThan(0);
    expect(dineoutCalls.every(([, options]) => (
      options.headers.Authorization === foodAuthorization
    ))).toBe(true);
    expect(searchedRestaurants.restaurants[0]).toMatchObject({
      id: 'swiggy-restaurant-9',
      name: 'Midnight Spice',
      areaName: 'Sample District',
      availabilityStatus: 'OPEN',
    });
    expect(fetchImpl.mock.calls
      .filter(([input]) => new URL(input.toString()).hostname === 'mcp.swiggy.com'
        && new URL(input.toString()).pathname === '/food')
      .every(([, options]) => /^Bearer .+$/.test(options.headers?.Authorization || '')))
      .toBe(true);
    expect(session.getStatus()).not.toHaveProperty('accessToken');

    await session.logout();
    expect(fetchImpl.mock.calls.at(-1)[0].toString()).toBe('https://mcp.swiggy.com/auth/logout');
    expect(fetchImpl.mock.calls.at(-1)[1].headers.Authorization).toMatch(/^Bearer .+$/);
    expect(session.getStatus()).toMatchObject({ connected: false, selectedAddress: false });
  });
});

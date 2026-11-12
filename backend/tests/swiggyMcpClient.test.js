import { describe, expect, it, vi } from 'vitest';
import {
  buildFoodToolArguments,
  createSwiggyMcpClient,
  getSwiggyDineoutEndpoint,
  getSwiggyFoodEndpoint,
} from '../src/providers/swiggyMcpClient.js';
import { createSwiggyDineoutMcpClient } from '../src/providers/swiggyDineoutMcpClient.js';

const jsonResponse = (payload, headers = {}) => new Response(JSON.stringify(payload), {
  headers: { 'Content-Type': 'application/json', ...headers },
});

describe('official Swiggy restaurant catalogue MCP client', () => {
  it('defaults to production while retaining explicit staging configuration', () => {
    expect(getSwiggyFoodEndpoint()).toBe('https://mcp.swiggy.com/food');
    expect(getSwiggyFoodEndpoint('production')).toBe('https://mcp.swiggy.com/food');
    expect(getSwiggyFoodEndpoint('staging')).toBe('https://mcp-staging.swiggy.com/food');
    expect(() => getSwiggyFoodEndpoint('development')).toThrow(/Unsupported Swiggy MCP environment/);
    expect(getSwiggyDineoutEndpoint()).toBe('https://mcp.swiggy.com/dineout');
    expect(getSwiggyDineoutEndpoint('staging')).toBe('https://mcp-staging.swiggy.com/dineout');
    expect(() => getSwiggyDineoutEndpoint('development'))
      .toThrow(/Unsupported Swiggy Dineout MCP environment/);
  });

  it('calls only documented read-only Dineout tools on a separate MCP session', async () => {
    const tools = [
      { name: 'get_saved_locations', inputSchema: { properties: {} } },
      {
        name: 'search_restaurants_dineout',
        inputSchema: {
          properties: { query: {}, addressId: {} },
          required: ['query'],
        },
      },
      {
        name: 'get_restaurant_details',
        inputSchema: {
          properties: { restaurantId: {}, latitude: {}, longitude: {} },
          required: ['restaurantId', 'latitude', 'longitude'],
        },
      },
      {
        name: 'get_available_slots',
        inputSchema: {
          properties: { restaurantId: {}, date: {}, latitude: {}, longitude: {} },
          required: ['restaurantId', 'date', 'latitude', 'longitude'],
        },
      },
    ];
    const fetchImpl = vi.fn(async (input, options = {}) => {
      const request = JSON.parse(options.body);
      if (request.method === 'initialize') {
        return jsonResponse(
          { jsonrpc: '2.0', id: request.id, result: {} },
          { 'Mcp-Session-Id': 'dineout-session' },
        );
      }
      if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (request.method === 'tools/list') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools },
        });
      }
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: { structuredContent: { success: true, data: {} } },
      });
    });
    const client = createSwiggyDineoutMcpClient({
      environment: 'production',
      accessToken: 'opaque-test-token',
      fetchImpl,
    });

    await client.getSavedLocations();
    await client.searchRestaurants({ addressId: 'dineout-location-id', query: 'Beyrut' });
    await client.getRestaurantDetails({
      restaurantId: 'dineout-restaurant-id',
      latitude: 12.9,
      longitude: 77.6,
    });
    await client.getAvailableSlots({
      restaurantId: 'dineout-restaurant-id',
      date: '2026-04-20',
      latitude: 12.9,
      longitude: 77.6,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(fetchImpl.mock.calls.every(([url]) => url === 'https://mcp.swiggy.com/dineout')).toBe(true);
    expect(fetchImpl.mock.calls[2][1].headers['MCP-Protocol-Version']).toBe('2025-03-26');
    expect(fetchImpl.mock.calls[2][1].headers['Mcp-Session-Id']).toBe('dineout-session');
    expect(fetchImpl.mock.calls.slice(3).map(([, options]) => JSON.parse(options.body).params))
      .toEqual([
        { name: 'get_saved_locations', arguments: {} },
        {
          name: 'search_restaurants_dineout',
          arguments: { query: 'Beyrut', addressId: 'dineout-location-id' },
        },
        {
          name: 'get_restaurant_details',
          arguments: { restaurantId: 'dineout-restaurant-id', latitude: 12.9, longitude: 77.6 },
        },
        {
          name: 'get_available_slots',
          arguments: {
            restaurantId: 'dineout-restaurant-id',
            date: '2026-04-20',
            latitude: 12.9,
            longitude: 77.6,
          },
        },
      ]);
  });

  it('forwards only arguments supported by the official tool schema', () => {
    expect(buildFoodToolArguments({
      properties: {
        addressId: {},
        query: {},
        offset: {},
        unsupported: {},
      },
      required: ['addressId', 'query'],
    }, {
      addressId: 'opaque-location-id',
      query: 'noodles',
      offset: 20,
      unsupported: 'not sent',
    })).toEqual({
      addressId: 'opaque-location-id',
      query: 'noodles',
      offset: 20,
    });

    expect(() => buildFoodToolArguments({
      properties: { unsupported: {} },
      required: ['unsupported'],
    }, {})).toThrow(/unsupported arguments/);
  });

  it('searches the official restaurant catalogue and preserves provider IDs', async () => {
    const tools = [{
      name: 'search_restaurants',
      inputSchema: {
        properties: { query: {}, addressId: {}, offset: {} },
        required: ['query', 'addressId'],
      },
    }];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }, { 'Mcp-Session-Id': 'mcp-session' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools } }))
      .mockResolvedValueOnce(jsonResponse({
        jsonrpc: '2.0',
        id: 3,
        result: {
          structuredContent: {
            success: true,
            data: {
              restaurants: [{
                id: 'swiggy-restaurant-id',
                name: 'Midnight Spice',
                areaName: 'Central District',
                address: '12 Market Road',
                phone: '+91-0000000000',
                cuisines: ['Indian'],
                avgRating: 4.6,
                imageUrl: 'https://images.swiggy.com/restaurant.jpg',
                availabilityStatus: 'OPEN',
              }],
              hasMore: false,
            },
          },
        },
      }));
    const client = createSwiggyMcpClient({
      accessToken: 'opaque-test-token',
      fetchImpl,
    });

    const result = await client.searchRestaurants({
      addressId: 'opaque-location-id',
      query: ' Midnight Spice ',
      offset: 10,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://mcp.swiggy.com/food');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toMatch(/^Bearer /);
    expect(fetchImpl.mock.calls[2][1].headers['MCP-Protocol-Version']).toBe('2025-03-26');
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body).params).toEqual({
      name: 'search_restaurants',
      arguments: {
        addressId: 'opaque-location-id',
        query: 'Midnight Spice',
        offset: 10,
      },
    });
    expect(result.restaurants[0]).toMatchObject({
      id: 'swiggy-restaurant-id',
      name: 'Midnight Spice',
      address: '12 Market Road',
      phone: '+91-0000000000',
      imageUrl: 'https://images.swiggy.com/restaurant.jpg',
    });
  });

  it('loads saved locations through the official get_addresses tool', async () => {
    const tools = [{
      name: 'get_addresses',
      inputSchema: {
        properties: { page: {}, pageSize: {} },
        required: ['page', 'pageSize'],
      },
    }];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }, { 'Mcp-Session-Id': 'mcp-session' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools } }))
      .mockResolvedValueOnce(jsonResponse({
        jsonrpc: '2.0',
        id: 3,
        result: {
          structuredContent: {
            success: true,
            data: {
              addresses: [{ id: 'opaque-location-id' }],
              pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2, hasMore: false },
            },
          },
        },
      }));
    const client = createSwiggyMcpClient({
      accessToken: 'opaque-test-token',
      fetchImpl,
    });

    const result = await client.getAddresses(2);

    expect(JSON.parse(fetchImpl.mock.calls[3][1].body).params).toEqual({
      name: 'get_addresses',
      arguments: { page: 2, pageSize: 10 },
    });
    expect(result.addresses[0].id).toBe('opaque-location-id');
    expect(result.pagination.page).toBe(2);
  });

  it('rejects missing query and location values before calling Swiggy', async () => {
    const fetchImpl = vi.fn();
    const client = createSwiggyMcpClient({ accessToken: 'opaque-test-token', fetchImpl });

    await expect(client.searchRestaurants({ addressId: '', query: 'noodles' }))
      .rejects.toThrow(/search location is required/);
    await expect(client.searchRestaurants({ addressId: 'opaque-location-id', query: '' }))
      .rejects.toThrow(/restaurant search query is required/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

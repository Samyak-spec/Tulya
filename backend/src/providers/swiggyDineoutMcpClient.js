import { createSwiggyMcpClient, getSwiggyDineoutEndpoint } from './swiggyMcpClient.js';

export const createSwiggyDineoutMcpClient = ({
  environment = 'production',
  accessToken,
  fetchImpl = fetch,
}) => {
  const client = createSwiggyMcpClient({
    endpoint: getSwiggyDineoutEndpoint(environment),
    accessToken,
    fetchImpl,
  });

  return {
    getSavedLocations: () => client.callTool('get_saved_locations'),

    searchRestaurants: ({ addressId, latitude, longitude, query }) => client.callTool('search_restaurants_dineout', {
      ...(addressId ? { addressId } : { latitude, longitude }),
      query,
    }),

    getRestaurantDetails: ({ restaurantId, latitude, longitude }) =>
      client.callTool('get_restaurant_details', { restaurantId, latitude, longitude }),

    getAvailableSlots: ({ restaurantId, date, latitude, longitude }) =>
      client.callTool('get_available_slots', { restaurantId, date, latitude, longitude }),
  };
};

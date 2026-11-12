import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1',
  timeout: 5000,
  withCredentials: true,
});

export const getHealthStatus = async () => {
  const response = await api.get('/health');
  return response.data;
};

export const getRestaurants = async (filters = {}) => {
  const response = await api.get('/restaurants', { params: filters });
  return response.data;
};

export const discoverRestaurants = async (payload) => {
  const response = await api.post('/restaurants/discover', payload, { timeout: 20000 });
  return response.data;
};

export const getRestaurantPhotoMatch = async (payload) => {
  const response = await api.post('/restaurants/photos/match', payload, { timeout: 20000 });
  return response.data;
};

export const searchRestaurants = async (payload) => {
  const response = await api.post('/ai/search', payload);
  return response.data;
};

export const compareRestaurantOffers = async (restaurant, userLocation) => {
  const response = await api.post('/compare', {
    mode: 'dine-in',
    restaurant,
    ...(userLocation ? { userLocation } : {}),
  }, { timeout: 25000 });
  return response.data;
};

export const getSwiggySession = async () => {
  const response = await api.get('/swiggy/session');
  return response.data.data;
};

export const getSwiggyAddresses = async () => {
  const response = await api.get('/swiggy/addresses', { params: { page: 1 } });
  return response.data.data.addresses;
};

export const selectSwiggyAddress = async (addressId) => {
  const response = await api.put('/swiggy/address', { addressId });
  return response.data;
};

export const searchSwiggyRestaurants = async (query, addressId) => {
  const response = await api.post('/swiggy/restaurants/search', { addressId, query });
  return response.data.data;
};

export const getRestaurantById = async (id) => {
  const response = await api.get(`/restaurants/${id}`);
  return response.data;
};

export const getRestaurantOffers = async (id) => {
  const response = await api.get(`/restaurants/${id}/offers`);
  return response.data;
};

export const getRestaurantMenu = async (id) => {
  const response = await api.get(`/restaurants/${id}/menu`);
  return response.data;
};

export default api;

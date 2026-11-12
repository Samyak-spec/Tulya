import mongoose from 'mongoose';
import { Restaurant } from '../models/Restaurant.js';
import { restaurantSeed } from '../data/restaurants.js';

const fallbackRestaurants = restaurantSeed.map((restaurant) => structuredClone(restaurant));
const isDatabaseConnected = () => mongoose.connection.readyState === 1;

export const initializeRestaurantCatalog = async () => {
  if (!isDatabaseConnected()) {
    return;
  }

  await Restaurant.bulkWrite(restaurantSeed.map((restaurant) => ({
    updateOne: {
      filter: { id: restaurant.id },
      update: {
        $setOnInsert: {
          id: restaurant.id,
          slug: restaurant.slug || restaurant.id,
          payload: restaurant,
        },
      },
      upsert: true,
    },
  })), { ordered: false });
};

export const listStoredRestaurants = async () => {
  if (isDatabaseConnected()) {
    const records = await Restaurant.find({}, { payload: 1, _id: 0 }).lean().exec();
    return records.map(({ payload }) => payload);
  }

  return fallbackRestaurants.map((restaurant) => structuredClone(restaurant));
};

export const findStoredRestaurant = async (id) => {
  if (isDatabaseConnected()) {
    const record = await Restaurant.findOne({
      $or: [{ id }, { slug: id }],
    }, { payload: 1, _id: 0 }).lean().exec();
    return record?.payload || null;
  }

  const restaurant = fallbackRestaurants.find((entry) => entry.id === id || entry.slug === id);
  return restaurant ? structuredClone(restaurant) : null;
};

export const createStoredRestaurant = async (restaurant) => {
  const now = new Date().toISOString();
  const payload = {
    ...restaurant,
    slug: restaurant.slug || restaurant.id,
    offers: [],
    createdAt: now,
    updatedAt: now,
  };

  if (isDatabaseConnected()) {
    await Restaurant.create({
      id: payload.id,
      slug: payload.slug,
      payload,
    });
    return payload;
  }

  if (fallbackRestaurants.some((entry) => entry.id === payload.id || entry.slug === payload.slug)) {
    const error = new Error('Restaurant already exists');
    error.statusCode = 409;
    throw error;
  }

  fallbackRestaurants.push(payload);
  return structuredClone(payload);
};

export const updateStoredRestaurant = async (id, updates) => {
  if (isDatabaseConnected()) {
    const record = await Restaurant.findOne({
      $or: [{ id }, { slug: id }],
    }).lean().exec();
    if (!record) {
      return null;
    }

    const payload = {
      ...record.payload,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    const slug = payload.slug || record.slug;
    await Restaurant.updateOne(
      { id: record.id },
      { $set: { slug, payload } },
      { runValidators: true },
    ).exec();
    return payload;
  }

  const restaurant = fallbackRestaurants.find((entry) => entry.id === id || entry.slug === id);
  if (!restaurant) {
    return null;
  }

  const updatedSlug = updates.slug || restaurant.slug;
  if (fallbackRestaurants.some((entry) => (
    entry.id !== restaurant.id && entry.slug === updatedSlug
  ))) {
    const error = new Error('Restaurant ID or slug already exists');
    error.statusCode = 409;
    throw error;
  }

  Object.assign(restaurant, updates, { updatedAt: new Date().toISOString() });
  return structuredClone(restaurant);
};

export const deleteStoredRestaurant = async (id) => {
  if (isDatabaseConnected()) {
    const result = await Restaurant.deleteOne({
      $or: [{ id }, { slug: id }],
    }).exec();
    return result.deletedCount > 0;
  }

  const index = fallbackRestaurants.findIndex((entry) => entry.id === id || entry.slug === id);
  if (index === -1) {
    return false;
  }

  fallbackRestaurants.splice(index, 1);
  return true;
};

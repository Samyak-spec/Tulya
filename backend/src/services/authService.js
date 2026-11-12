import crypto from 'crypto';
import { z } from 'zod';
import { addUser, findUserByEmail, findUserById } from '../store/users.js';
import { comparePassword, createToken, hashPassword } from '../config/auth.js';

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  location: z.string().min(2).max(80).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  location: user.location || null,
  dietaryPreferences: user.dietaryPreferences || [],
  cuisinePreferences: user.cuisinePreferences || [],
  budgetPreferences: user.budgetPreferences || [],
  favoriteRestaurants: user.favoriteRestaurants || [],
  preferredPlatforms: user.preferredPlatforms || [],
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const registerUser = async ({ name, email, password, location }) => {
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    const error = new Error('User already exists');
    error.statusCode = 409;
    throw error;
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: hashPassword(password),
    location: location || null,
    dietaryPreferences: [],
    cuisinePreferences: [],
    budgetPreferences: [],
    favoriteRestaurants: [],
    preferredPlatforms: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await addUser(user);
  } catch (error) {
    if (error.code === 11000) {
      const conflict = new Error('User already exists');
      conflict.statusCode = 409;
      throw conflict;
    }

    throw error;
  }

  return {
    user: sanitizeUser(user),
    token: createToken(user),
  };
};

export const loginUser = async ({ email, password }) => {
  const user = await findUserByEmail(email);

  if (!user || !comparePassword(password, user.passwordHash)) {
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    throw error;
  }

  return {
    user: sanitizeUser(user),
    token: createToken(user),
  };
};

export const getUserById = async (id) => {
  const user = await findUserById(id);

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return sanitizeUser(user);
};

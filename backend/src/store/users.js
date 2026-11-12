import mongoose from 'mongoose';
import { User } from '../models/User.js';

const users = [];
const isDatabaseConnected = () => mongoose.connection.readyState === 1;

export const findUserByEmail = async (email) => {
  const normalizedEmail = email.toLowerCase();
  if (isDatabaseConnected()) {
    return User.findOne({ email: normalizedEmail }).select('+passwordHash').lean().exec();
  }

  return users.find((user) => user.email.toLowerCase() === normalizedEmail);
};

export const findUserById = async (id) => {
  if (isDatabaseConnected()) {
    return User.findOne({ id }).lean().exec();
  }

  return users.find((user) => user.id === id);
};

export const addUser = async (user) => {
  if (isDatabaseConnected()) {
    await User.create(user);
    return user;
  }

  users.push(user);
  return user;
};

export const updateUserById = async (id, updates) => {
  if (isDatabaseConnected()) {
    return User.findOneAndUpdate(
      { id },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean().exec();
  }

  const user = users.find((entry) => entry.id === id);
  if (!user) {
    return null;
  }

  Object.assign(user, updates, { updatedAt: new Date().toISOString() });
  return user;
};

export const getUsers = () => users;

export default users;

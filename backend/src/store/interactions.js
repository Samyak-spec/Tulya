import mongoose from 'mongoose';
import { UserInteraction } from '../models/UserInteraction.js';

const fallbackInteractions = [];
const isDatabaseConnected = () => mongoose.connection.readyState === 1;

export const addStoredInteraction = async (interaction) => {
  if (isDatabaseConnected()) {
    await UserInteraction.create(interaction);
    return;
  }

  fallbackInteractions.push({ ...interaction, createdAt: new Date() });
};

export const listStoredInteractions = async (userId, limit) => {
  if (isDatabaseConnected()) {
    return UserInteraction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  return fallbackInteractions
    .filter((interaction) => interaction.userId === userId)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit);
};

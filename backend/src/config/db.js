import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

export const connectDatabase = async () => {
  if (env.NODE_ENV === 'test') {
    return undefined;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 1000,
    });
    logger.info('MongoDB connected');
    return mongoose.connection;
  } catch (error) {
    if (env.NODE_ENV === 'production') {
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }

    logger.warn('MongoDB connection unavailable; continuing without a database connection', {
      error: error.message,
    });
    return null;
  }
};

import app from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { initializeRestaurantCatalog } from './store/restaurants.js';

const startServer = async () => {
  try {
    await connectDatabase();
    await initializeRestaurantCatalog();
    app.listen(env.PORT, () => {
      logger.info('Tulya backend listening', { port: env.PORT });
    });
  } catch (error) {
    logger.error('Failed to start Tulya backend', { error: error.message });
    process.exit(1);
  }
};

startServer();

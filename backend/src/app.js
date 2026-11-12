import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const allowedOrigins = new Set([
  ...env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
  `http://localhost:${env.PORT}`,
  `http://127.0.0.1:${env.PORT}`,
  `http://[::1]:${env.PORT}`,
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(helmet());
app.use(express.json());
app.use(morgan((tokens, req, res) => [
  tokens.method(req, res),
  req.path,
  tokens.status(req, res),
  `${tokens['response-time'](req, res)} ms`,
].join(' ')));

app.use((req, res, next) => {
  logger.info('Request received', {
    method: req.method,
    url: req.path,
  });
  next();
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Tulya API',
  });
});

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

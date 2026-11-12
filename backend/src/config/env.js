import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/savory'),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174'),
  GOOGLE_MAPS_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(20).optional(),
  ),
  SWIGGY_OAUTH_BASE_URL: z.string().url().default('https://mcp.swiggy.com'),
  SWIGGY_LOCAL_REDIRECT_URI: z.string().url().default(
    'http://localhost:4000/api/v1/swiggy/auth/callback',
  ),
  SWIGGY_MCP_ENVIRONMENT: z.enum(['staging', 'production']).default('production'),
  JWT_SECRET: z.string().min(32).optional(),
  RESTAURANT_ADMIN_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32).optional(),
  ),
}).superRefine((values, context) => {
  if (values.NODE_ENV === 'production' && !values.JWT_SECRET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'JWT_SECRET must be configured in production',
      path: ['JWT_SECRET'],
    });
  }

  if (values.NODE_ENV === 'production' && !values.RESTAURANT_ADMIN_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'RESTAURANT_ADMIN_API_KEY must be configured in production',
      path: ['RESTAURANT_ADMIN_API_KEY'],
    });
  }

  const redirect = new URL(values.SWIGGY_LOCAL_REDIRECT_URI);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname)
    || !['http:', 'https:'].includes(redirect.protocol)
    || redirect.pathname !== '/api/v1/swiggy/auth/callback'
    || redirect.search
    || redirect.hash
    || redirect.username
    || redirect.password
    || redirect.port !== String(values.PORT)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SWIGGY_LOCAL_REDIRECT_URI must be the exact callback path on localhost and the configured backend port',
      path: ['SWIGGY_LOCAL_REDIRECT_URI'],
    });
  }

  const oauthBase = new URL(values.SWIGGY_OAUTH_BASE_URL);
  if (
    oauthBase.protocol !== 'https:'
    || !['mcp.swiggy.com', 'mcp-staging.swiggy.com'].includes(oauthBase.hostname)
    || oauthBase.pathname !== '/'
    || oauthBase.search
    || oauthBase.hash
    || oauthBase.username
    || oauthBase.password
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SWIGGY_OAUTH_BASE_URL must be an official Swiggy MCP HTTPS host',
      path: ['SWIGGY_OAUTH_BASE_URL'],
    });
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration', parsedEnv.error.flatten());
  throw new Error('Invalid environment configuration');
}

export const env = parsedEnv.data;

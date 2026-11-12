# Environment Variables

Never commit real secrets.

## Backend example

PORT=5000
NODE_ENV=development
MONGODB_URI=
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
AI_PROVIDER=
AI_API_KEY=
FRONTEND_URL=http://localhost:5173

Production requires `JWT_SECRET` (at least 32 characters) and a working
`MONGODB_URI`. User accounts, preferences, and favorites persist in MongoDB;
in-memory user storage is limited to development without a database and tests.

## Provider credentials

Keep provider credentials in backend-only environment variables.
For nearby Google Places discovery, configure `GOOGLE_MAPS_API_KEY` in the
backend environment (never a `VITE_*` variable). Restrict the replacement key
to Places API (New), apply server IP restrictions where available, enable quotas
and billing alerts, and use `backend/.env.example` as the variable reference.
The exposed key from chat must be revoked before configuring a replacement.

If a provider has no legitimate integration available, use:
PROVIDER_MODE=mock

## Frontend

VITE_API_BASE_URL=http://localhost:5000/api/v1

Never put secret API keys in VITE_* variables.

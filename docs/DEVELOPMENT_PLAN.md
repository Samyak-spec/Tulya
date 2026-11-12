# Development Plan

The developer should implement one phase at a time and keep the application runnable after every phase.

## Phase 0 — Repository
Create:
- frontend/
- backend/
- docs/
- scripts/
- .github/

Add README, env examples, linting, formatting and Git hooks if practical.

## Phase 1 — Frontend foundation
- Vite React
- Tailwind
- Router
- component system
- responsive shell
- home page
- results page skeleton

## Phase 2 — Backend foundation
- Express
- MongoDB connection
- environment validation
- error handling
- logging
- health endpoint

## Phase 3 — Auth
- register
- login
- JWT
- protected routes
- user profile

## Phase 4 — Restaurant data
- models
- CRUD/admin seed
- search/filter
- restaurant detail

## Phase 5 — Offer engine
- offer model
- discount calculator
- provider normalization
- comparison API
- deal score

## Phase 6 — UI integration
- live API integration
- loading states
- empty states
- error states
- responsive comparison UI

## Phase 7 — AI
- intent parser
- structured search
- recommendation explanations

## Phase 8 — Personalization
- interaction tracking
- preference aggregation
- personalized ranking

## Phase 9 — Provider adapters
- mock adapters first
- add legitimate provider integrations where available
- deep-link redirects
- provider health monitoring

## Phase 10 — Testing and production
- unit tests
- integration tests
- frontend tests
- security review
- performance review
- deployment

## Current completion status

- MVP portions of phases 0–7 are implemented, including the responsive
  discovery UI, deterministic comparison, structured intent parsing, and
  catalog-backed explanations. The approved frontend design remains unchanged.
- Phase 4: MongoDB-backed restaurant catalog persistence, one-time sample
  catalog initialization, and a server-key-protected catalog administration
  API are implemented. Development mode retains an in-memory fallback.
- Phase 8: account preferences and favorites are persisted when MongoDB is
  connected. Authenticated interaction capture and deterministic
  preference/activity-based recommendations are implemented; interaction
  records expire after 90 days in MongoDB.
- Phase 9: Google Places Nearby Search is available through a backend-only
  adapter when `GOOGLE_MAPS_API_KEY` is configured. Swiggy uses its official
  OAuth 2.1 + PKCE local-development flow and Food MCP adapter
  (`get_addresses`, `search_restaurants`, `fetch_food_coupons`). The local
  Swiggy flow is implemented but needs portal allowlisting/staging access and
  the user must select an address. Zomato and EazyDiner adapters are safely
  unavailable pending authorized integrations. Live verified offers cannot be
  enabled without provider approval/credentials.
- Phase 10: automated tests, lint, and production frontend build are available
  locally. Production deployment, hosted database/API configuration, an
  external AI provider, and load testing remain unconfigured because they
  require external accounts, credentials, or cost/privacy decisions. A
  dedicated security review of the complete application also remains.

The Maps key previously pasted into chat must be revoked. Configure only a
rotated, restricted key in the backend environment; never put it in frontend
configuration. Google Places supplies restaurant discovery, not live deal
prices. Tulya must continue to mark missing offers rather than infer them.

Before production, set `JWT_SECRET` and `RESTAURANT_ADMIN_API_KEY` to separate
random secrets, provision MongoDB, configure allowed frontend origins, and
configure only provider integrations approved for production. The development
sample catalog and its sample ratings/prices must not be represented as live
provider data.

Swiggy local OAuth configuration is documented in the README. OAuth state,
PKCE verifier, access token, and selected address are memory-only; restarting
the backend clears the session. Do not persist tokens in `.env` or commit them.
Production Swiggy OAuth/session storage and access approval are out of scope
for the local integration.

## Copilot workflow
Before implementing a phase:
1. Read relevant docs.
2. Inspect existing code.
3. Make a small implementation.
4. Run tests/lint/build.
5. Fix failures.
6. Update docs if architecture changed.
7. Commit with a focused message.

Never rewrite large parts of the repository without a clear reason.

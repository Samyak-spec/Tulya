# Tulya — Restaurant Discovery & Dine-in Offer Comparison

## Product vision
Tulya helps users find restaurants and compare provider-specific dine-in and table-booking offers.

Users can:
- Search and discover restaurants.
- Compare provider-specific dining and table-booking offers.
- See which supplied offers are available at each provider.
- Open the restaurant page on the originating provider.

Tulya is not a food-ordering or delivery checkout application.

## Initial technology stack
- Frontend: React + Vite, Tailwind CSS, Framer Motion, React Router, TanStack Query, Axios, Zod, Lucide React
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Authentication: JWT + bcrypt
- AI: provider-agnostic AI service behind a backend interface
- Validation: Zod
- Testing: Vitest/Jest + Supertest + React Testing Library
- Deployment: frontend/backend/database providers chosen during implementation

## Critical product rule
Never make the LLM responsible for factual pricing or discount calculations. AI parses intent and explains results; deterministic backend services calculate prices, discounts, rankings and eligibility.

## Data integration rule
Restaurant catalogue discovery is independent from offer enrichment. The active Home search discovers restaurants only from the selected Swiggy location's live results. Matching Tulya records enrich those results with supplied restaurant details and dine-in/table-booking offers; they do not add restaurants to discovery. Google Places remains available through separate backend catalogue endpoints, but is not the active Home discovery source. Do not hard-code provider-specific assumptions into the comparison engine. Never treat delivery coupons as dining offers.

## Provider offer comparison
- The backend normalizes provider offers to `provider`, `restaurantId`, `originalPrice`, `discount`, `finalPrice`, `offerText`, `code`, `terms`, `eligibility`, `deepLink`, and `isVerified`. Only verified offers with an actual final price can win the comparison.
- Swiggy uses the official [Builders Club documentation](https://mcp.swiggy.com/builders/llms-full.txt), OAuth 2.1 + PKCE, and the Food MCP's read-only [`get_addresses`](https://mcp.swiggy.com/builders/docs/reference/food/get_addresses.md), [`search_restaurants`](https://mcp.swiggy.com/builders/docs/reference/food/search_restaurants.md), and [`fetch_food_coupons`](https://mcp.swiggy.com/builders/docs/reference/food/fetch_food_coupons.md) tools. No Swiggy OAuth token is manually entered into the app or written to `.env`: the backend dynamically registers a public OAuth client, keeps the PKCE verifier/state and five-day access token in server memory, and never returns the token to the browser. This follows Swiggy's instruction to keep tokens in memory or secure storage and never store them in plaintext. The session is local-development only and must be reauthorized after a backend restart or token expiry.
- Configure `SWIGGY_OAUTH_BASE_URL=https://mcp.swiggy.com` and `SWIGGY_LOCAL_REDIRECT_URI=http://localhost:4000/api/v1/swiggy/auth/callback` in `backend/.env`. Local development defaults to `SWIGGY_MCP_ENVIRONMENT=production`, calling the documented `https://mcp.swiggy.com/food` endpoint; set it to `staging` only after Swiggy grants staging access. The developer quickstart permits localhost development without production approval; applying for access is required before taking the integration live, and Swiggy issues staging access during application review. Start the browser flow at `http://localhost:4000/api/v1/swiggy/auth/start`. After OAuth returns to the backend callback, list addresses with `GET /api/v1/swiggy/addresses?page=1`; the response provides opaque address IDs only. Select an ID using `PUT /api/v1/swiggy/address` with `{"addressId":"<returned-id>"}`. Search using `POST /api/v1/swiggy/restaurants/search` with `{"addressId":"<selected-id>","query":"pizza","offset":0,"collection":"BOLT"}`; omit optional `offset` and `collection` unless needed. Fetch coupons using `POST /api/v1/swiggy/restaurants/<swiggy-restaurant-id>/coupons` with `{"addressId":"<selected-id>"}`. Coupon lookup is limited to restaurant IDs returned by a search for that selected address. Only the selected address ID is retained in server memory; phone numbers and address text are not returned. Check connection state at `GET /api/v1/swiggy/session`, clear/revoke the local session with `POST /api/v1/swiggy/disconnect`, and compare offers through the existing comparison API. The OAuth routes return 404 outside development or when accessed off-loopback.
- Tulya's Swiggy OAuth dynamically registers a client; do not request or hard-code a client ID/secret. The access application asks for integration name/organization, exact localhost callback, Food server use, expected call/order volume, use-case description, and technical contact. Swiggy reviews applications and issues staging access; the documentation recommends a short working-flow video. Tokens expire after five days; refresh-token issuance is not wired in v1, so reauthorize on expiry, 401, or 419. The server searches Swiggy restaurants, only considers `OPEN` results, matches by name/address before requesting coupons, and never invents a Swiggy restaurant ID. Coupon responses do not necessarily include actual cart prices; verified coupon text without comparable amounts is not ranked as a price deal.
- The Swiggy adapter is explicitly local-development only. Production access approval, multi-user delegated OAuth/session storage, secrets vaulting, operational monitoring/retry policy, and deployment are not implemented by this local integration.
- Swiggy's documented coupon response provides coupon/applicability information, not a guaranteed final cart price. These coupons can be shown as verified provider coupon information only when applicable and COD-eligible; without actual original/discount/final amounts, they are not ranked as a price deal.
- Swiggy Builders Club access is reviewed before production use. See its [authentication](https://mcp.swiggy.com/builders/docs/start/authenticate/) and [production access](https://mcp.swiggy.com/builders/docs/operate/access/) guidance.
- No current public Zomato restaurant-offer API specification was verified. The adapter stays unavailable until an authorized API or partner integration is provided.
- EazyDiner's [Partner Restaurant Programme](https://www.eazydiner.com/partner-restaurant) is a legitimate contact path, but no public API, affiliate feed or general tracked deep-link specification was verified. Its adapter stays unavailable until authorized technical access is provided. Consumer referral links are not treated as a restaurant-offer integration.
- All provider secrets remain backend-only. Provider statuses and unavailable explanations are safe to return to the frontend; access tokens, OAuth codes and address identifiers are never returned.

## Restaurant discovery and enrichment
- The active homepage search uses live Swiggy restaurant results for the selected saved location. Local parsing, typo-tolerant matching and suggestions refine the Swiggy results; they do not create catalogue entries. Matching Tulya records add supplied offers, ratings and exact provider links. Missing provider data remains unknown, and manual records are not a discovery whitelist.
- Swiggy search uses the authorized backend OAuth session and selected opaque address ID. The browser can search that saved location without granting geolocation; exact user coordinates are not required for this discovery flow.
- The separate Google-backed catalogue endpoints use the server-side `GOOGLE_MAPS_API_KEY`. Place data is fetched on demand and is not persisted in Tulya's restaurant database. Never put the Maps key in a `VITE_*` variable.
- Missing restaurant fields remain unknown. Offer comparison displays only dine-in/table-booking records in the shared normalized offer schema; delivery coupons, payment-card offers, cashback and wallet promotions are excluded.
- The app is served by Vite at `http://localhost:5173/`. The backend at `http://localhost:4000/` is an API and is not the frontend. Use the VS Code launch configuration **Tulya frontend (Vite)** to open the correct app URL. Vite is pinned to port 5173 and fails clearly rather than silently selecting another port if that port is occupied.
- Vite's development server provides SPA fallback for application routes such as `/restaurants`; React Router displays a Tulya not-found page for unknown routes.

## Separate Google-backed restaurant catalogue API
- These backend catalogue endpoints are separate from the active Home search, which uses Swiggy results.
- `POST /api/v1/restaurants/discover` accepts a search phrase, optional Bhubaneswar locality or current coordinates, and a result radius. It uses Places Text Search for query searches and manual/default locality discovery, and nearby search when current coordinates are available. If reverse geocoding is unavailable, discovery falls back to a Bhubaneswar text search; exact coordinates are not returned to the frontend.
- `GET /api/v1/restaurants/:id` resolves live catalogue details for a catalogue place ID. `GET /api/v1/restaurants/photos` proxies validated photo references and keeps the API key server-side.
- Nearby search is limited by the provider response cap. Provider limits can prevent exhaustive results.
- The MongoDB seeded restaurant store and its admin API are retained for existing backend features; the discovery UI does not use it as the public Bhubaneswar catalogue.
- Never put the Maps key in a `VITE_*` variable.

## Backend administration and user signals
- When MongoDB is connected, the legacy restaurant store is seeded once from its backend catalog and then read from MongoDB. Without MongoDB, that store is in memory and resets on restart.
- Catalog administration is available only through the backend at `/api/v1/admin/restaurants`. Configure a unique `RESTAURANT_ADMIN_API_KEY` with at least 32 characters in `backend/.env` and send it as `X-Admin-Key`. The API supports listing, creating, updating, and deleting restaurants. It rejects client-supplied offer fields; only provider adapters can supply comparison offers. Use HTTPS and keep the key in a server-side secret manager in deployed environments.
- Authenticated users can record `view` and `offer_click` events through `POST /api/v1/users/me/interactions` and request deterministic recommendations from `GET /api/v1/users/me/recommendations`. Interaction records contain only the user, catalog restaurant, event type, and timestamp; MongoDB expires them after 90 days. Explicit cuisine preferences and favorites are combined with these recent signals. The routes require the existing bearer-token authentication.

## MVP
1. Authentication
2. Restaurant discovery
3. Budget-based filtering
4. Offer comparison
5. Effective-price calculation
6. Platform comparison
7. Restaurant detail page
8. AI natural-language search
9. Basic personalization
10. Redirect/deep-link handling

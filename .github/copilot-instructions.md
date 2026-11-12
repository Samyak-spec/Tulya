# GitHub Copilot Instructions - FoodAI / Tulya

Tulya is a restaurant-discovery and dine-in/table-booking offer comparison app, not a food-delivery checkout product. For product and integration details, see [README.md](../README.md), [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), [docs/DEAL_ENGINE.md](../docs/DEAL_ENGINE.md), and [docs/TESTING.md](../docs/TESTING.md).

## Build, test, and lint

Run these commands from the repository root:

| Command | Purpose |
| --- | --- |
| `npm install` | Install root and workspace dependencies |
| `npm run dev` | Run frontend and backend together |
| `npm run frontend:dev` / `npm run backend:dev` | Run one workspace in development |
| `npm run build` | Build the frontend with Vite; there is no backend build script |
| `npm run lint` | Lint frontend, then backend |
| `npm test` | Run both Vitest suites once |
| `npm run test --workspace backend -- --run tests/compare.test.js` | Run one backend test file |
| `npm run test --workspace frontend -- --run src/App.test.jsx` | Run one frontend test file |
| `npm run test --workspace backend -- --run tests/compare.test.js -t "test name"` | Run a named backend test |

The frontend dev server uses port `5173`; the Express API defaults to port `4000`. Root scripts are in `package.json`; workspace scripts and Vitest setup are in `frontend/package.json` and `backend/package.json`.

## Architecture and data flow

- The root npm project uses separate `frontend` and `backend` workspaces. Application code is JavaScript/JSX with ES modules. Keep responsibilities in their existing workspace and follow current patterns rather than introducing TypeScript by default.
- The frontend is a Vite single-page app with routes in `frontend/src/App.jsx`; `frontend/src/services/api.js` is the Axios boundary for backend requests. The API is mounted at `/api/v1` in `backend/src/app.js`.
- Backend request flow is route -> controller -> service -> store/model or provider adapter. Routes attach middleware, controllers parse and shape HTTP requests, and business logic belongs in `backend/src/services/`. Register API routes in `backend/src/routes/index.js`.
- Restaurant discovery and offer enrichment are separate. Google Places discovery is fetched on demand by the backend and is not persisted; Tulya's stored restaurant records enrich matching results rather than defining the public discovery catalogue. The legacy restaurant store uses MongoDB when connected and in-memory storage otherwise.
- Provider integrations are isolated in `backend/src/providers/`. `providerOfferService.js` collects provider results independently and exposes per-provider statuses; comparison logic consumes normalized offers rather than provider-specific response shapes.

## Domain conventions

- Offers use the shared Zod schemas in `backend/src/providers/offerSchema.js`. Keep provider-specific parsing in its adapter and normalize before returning results. Preserve explicit provider statuses (`verified`, `mock`, `unavailable`, `error`) rather than disguising missing data as success.
- Only verified dine-in/table-booking offers with a real final price can participate in price comparison or win a best result. Coupon descriptions without comparable amounts are not prices. Exclude delivery coupons, payment-card offers, cashback, and wallet promotions from dine-in ranking.
- Price, discount, eligibility, filtering, and ranking are deterministic backend responsibilities (`backend/src/services/dealService.js`). AI may interpret intent or explain results, but must not generate factual offers, prices, ratings, or availability. The current `/api/v1/ai/search` controller returns `410`; do not assume an AI search service is implemented.
- Live provider facts must come from authorized sources. Swiggy OAuth is a local-development flow that keeps PKCE/session tokens in backend memory; never ask users to paste tokens, persist them in `.env`, or expose them to the browser. Zomato and EazyDiner adapters remain unavailable until authorized technical access exists. See the provider notes in [README.md](../README.md).
- Backend request payloads, environment variables, normalized offers, and provider results are validated with Zod. Keep server credentials out of frontend code and `VITE_*` variables; `GOOGLE_MAPS_API_KEY` is backend-only.

# System Architecture

## High-level flow

Browser
-> React frontend
-> frontend API client
-> Express API
-> Swiggy OAuth-backed restaurant search
-> live Swiggy results
-> frontend search-intent matching and Tulya-record enrichment
-> restaurant results with separate provider offers and ratings

## Backend modules

- auth
- users
- restaurants
- offers
- platforms
- comparison
- recommendations
- ai
- favorites
- search-history
- analytics
- provider-adapters

## Important separation

### Active restaurant search
- Uses the selected Swiggy saved location and only returns restaurants discovered in live Swiggy search results.
- Parses search intent, suggestions and typo-tolerant matching locally in the frontend; this flow does not depend on an AI service or Google Places discovery.
- Uses matching Tulya records only to enrich live candidates with supplied details, offers, ratings and exact provider links.
- Keeps unknown provider data unknown. Manual records do not create discovery results.

The current `/api/v1/ai/search` endpoint returns `410`; do not treat AI search as implemented.

### Deterministic services
Responsible for:
- Price calculation
- Discount calculation
- Eligibility
- Ranking
- Filtering
- Provider normalization

### Provider adapters
- Swiggy OAuth provides live restaurant search and coupon information for the selected address.
- Provider-offer data is normalized before comparison. Only eligible dine-in/table-booking offers with comparable final prices can participate in price ranking.
- A provider without authorized access remains explicitly unavailable; mock or missing data must not be represented as live verification.

## Recommended architecture

Frontend
  |
API routes
  |
Controllers
  |
Services
  |
Repositories + Provider Adapters
  |
MongoDB / external integrations

Keep controllers thin. Business logic belongs in services.

## Security
- Validate all request bodies/params.
- Never expose provider secrets to frontend.
- Store secrets in environment variables.
- Hash passwords.
- Use JWT securely.
- Apply rate limiting.
- Use Helmet.
- Configure CORS explicitly.
- Sanitize user-generated content.
- Log errors without leaking secrets.

## Scalability
Use provider adapters and normalized domain models so new platforms can be added without changing comparison logic.

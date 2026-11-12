# API Specification

Base path: `/api/v1`

## Auth
POST `/auth/register`
POST `/auth/login`
GET `/auth/me`

## Restaurants
GET `/restaurants`
GET `/restaurants/:id`
GET `/restaurants/:id/offers`
GET `/restaurants/:id/menu`

Query filters:
- location
- budget
- people
- cuisine
- rating
- vegetarian
- distance
- mode

Nearby search may also send `latitude`, `longitude`, and `distance` (radius in km).
Latitude and longitude must be provided together. Restaurant distance is calculated
server-side with the Haversine formula; clients should request location permission
before sending coordinates. When a backend-only `GOOGLE_MAPS_API_KEY` is configured,
nearby listings use the Google Places API (New); otherwise the seeded sample catalog
is used. Nearby Google results include no offers unless a verified offer source exists.
Google Place photos are proxied by the backend so the API key is not exposed to clients.

## Comparison
POST `/compare`

Example request:
{
  "mode": "dine-in",
  "location": "Bhubaneswar",
  "people": 4,
  "budget": 2000,
  "cuisine": ["Indian"]
}

Response should contain normalized restaurant/platform results with:
- originalAmount
- discountAmount
- fees
- finalAmount
- savings
- dealScore
- deepLink

## AI
POST `/ai/search`

Input:
{
  "query": "I want spicy food for two under 1000",
  "latitude": 12.9352,
  "longitude": 77.6245,
  "distance": 20
}

Output:
{
  "intent": {
    "budget": 1000,
    "people": 2,
    "meal": null,
    "cuisine": null,
    "spicy": true,
    "mode": null
  },
  "results": [],
  "source": "restaurant-catalog"
}

The current search parser is deterministic and validates its structured intent;
it does not call an external AI provider. Results and prices come from the
restaurant catalog and deterministic offer service. Nearby search accepts a
radius up to 60 km when both coordinates are supplied.

## User
GET `/users/me/preferences`
PATCH `/users/me/preferences`
GET `/users/me/favorites`
POST `/users/me/favorites/:restaurantId`
DELETE `/users/me/favorites/:restaurantId`

All `/users/me/*` routes require a signed-in user. Preferences accept dietary,
cuisine, budget and provider preferences; favorites only accept restaurants
present in the application catalog.

## Redirect
GET `/redirect/:platform/:restaurantId`

Track click analytics, then redirect to the verified deep link.

## API rules
- Return consistent error objects.
- Validate every request.
- Use pagination for lists.
- Never trust prices supplied by the client.
- Do not expose internal provider IDs unless necessary.

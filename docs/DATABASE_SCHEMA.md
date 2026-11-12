# MongoDB Data Model

## User
- _id
- name
- email
- passwordHash
- location
- dietaryPreferences
- cuisinePreferences
- budgetPreferences
- favoriteRestaurants[]
- preferredPlatforms[]
- createdAt
- updatedAt

## Restaurant
- _id
- name
- slug
- cuisines[]
- description
- rating
- priceRange
- vegetarianFriendly
- location { address, city, latitude, longitude }
- images[]
- platforms[]
- createdAt
- updatedAt

## Platform
- _id
- name
- slug
- type
- logo
- baseUrl
- active

## RestaurantPlatform
- restaurantId
- platformId
- externalRestaurantId
- deepLink
- availability
- lastSyncedAt

## Offer
- restaurantId
- platformId
- title
- discountType
- discountValue
- maxDiscount
- minOrderValue
- applicableDays[]
- applicableTimes[]
- couponCode
- conditions
- validFrom
- validUntil
- active
- source
- lastVerifiedAt

## MenuItem
- restaurantId
- name
- category
- description
- price
- vegetarian
- spicyLevel
- tags[]
- image

## SearchHistory
- userId
- rawQuery
- structuredIntent
- resultsShown
- selectedRestaurantId
- selectedPlatformId
- createdAt

## Interaction
- userId
- type
- restaurantId
- menuItemId
- platformId
- metadata
- createdAt

## Recommendation
- userId
- restaurantId
- score
- reasons[]
- generatedAt

## Indexing
Create indexes for:
- Restaurant city/location
- Restaurant cuisines
- Restaurant rating
- Offer restaurantId + platformId
- Offer validUntil
- SearchHistory userId + createdAt
- Interaction userId + createdAt

# Testing Strategy

## Unit tests
Test:
- natural-language search parsing, aliases, typo correction and suggestion generation
- matching and filtering of live Swiggy search candidates
- additive live/manual offer enrichment, provider links and rating separation
- discount calculation
- fee calculation
- deal score
- ranking
- preference scoring
- provider normalization

## Integration tests
Test:
- auth
- Swiggy restaurant search for a selected saved location
- comparison
- favorites

## Frontend tests
Test:
- search suggestions before submission and suggestion selection
- search when browser geolocation is denied
- party-size estimates labeled separately from provider prices
- filters
- result rendering
- offer comparison
- loading/error states
- navigation

## Critical edge cases
- 0% discount
- maximum discount cap
- minimum order requirement
- expired offer
- future offer
- non-stackable discounts
- missing fees
- multiple offers
- no results
- invalid budget
- large party size
- provider unavailable

## Definition of done
A feature is complete only when:
- implementation exists
- tests exist
- lint passes
- build passes
- docs are updated if needed
- no secrets are committed

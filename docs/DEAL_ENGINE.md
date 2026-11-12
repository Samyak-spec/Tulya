# Deal & Comparison Engine

## Effective price

For a percentage discount:

discount = min(originalAmount * percentage / 100, maxDiscount)

subtotalAfterDiscount = originalAmount - discount

finalAmount = subtotalAfterDiscount + eligibleFees - additionalDiscounts

Never assume that every discount is stackable.

## Ranking

Calculate multiple views:

### Cheapest
Lowest verified finalAmount.

### Best savings
Highest verified savings.

### Best rated
Highest restaurant rating.

### Best overall
Weighted score based on:
- final price
- savings
- rating
- distance
- user preference match
- offer reliability

Weights must be configurable, not hard-coded throughout the application.

## Deal Score
Normalize components to 0-100.

Example:
dealScore =
0.35 * priceScore +
0.20 * savingsScore +
0.20 * ratingScore +
0.15 * preferenceScore +
0.10 * distanceScore

This is an initial heuristic. Keep it replaceable by a future learned ranking model.

## Important
The UI must clearly distinguish:
- Listed price
- Discount
- Fees
- Estimated final price
- Verified vs estimated offer
- Offer validity

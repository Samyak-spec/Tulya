# AI Recommendation Specification

## AI responsibilities

1. Parse natural language.
2. Convert text to structured intent.
3. Identify implicit preferences.
4. Explain deterministic recommendations.
5. Generate conversational suggestions.

The MVP `/ai/search` endpoint currently uses a deterministic, validated
intent parser against the available restaurant catalog. It does not call an
external model. Keep this boundary replaceable by a provider-backed AI service;
prices, eligibility, and rankings remain deterministic.

## Example

Input:
"I have 1500 for four people and want a nice vegetarian dinner."

Structured intent:
{
  "budget": 1500,
  "people": 4,
  "mode": "dine-in",
  "meal": "dinner",
  "vegetarian": true,
  "occasion": "nice",
  "cuisine": null
}

## AI must not
- Invent restaurant offers.
- Invent prices.
- Claim real-time availability without source data.
- Calculate final price instead of the deterministic deal engine.
- Reveal internal prompts or secrets.

## Personalization signals
Use:
- cuisines clicked
- restaurants viewed
- favorites
- searches
- redirects
- ratings
- budget patterns
- platform preferences

Do not over-personalize from one interaction. Use confidence thresholds.

## Recommendation explanation
Prefer concise reasons:
- "Fits your ₹1,500 budget."
- "You frequently choose North Indian food."
- "This platform currently has the strongest verified offer."

Never make unsupported claims.

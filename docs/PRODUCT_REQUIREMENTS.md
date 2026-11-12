# Product Requirements Document

## 1. Problem
Restaurant and food-ordering users often have to check multiple apps to determine:
- Which restaurant fits their budget.
- Which platform has the best offer.
- What the final payable amount will be.
- Which food matches their preferences.

Tulya consolidates this decision into one interface.

## 2. Target users
### Budget-conscious diners
Want the lowest effective price.

### Food explorers
Want recommendations based on cuisine, mood and preferences.

### Frequent food-ordering users
Want personalized recommendations and recurring deals.

### Groups
Want budget calculations for multiple people.

## 3. Core user journeys

### Dine-out
Set location -> people -> budget -> cuisine/preferences -> compare restaurants -> compare platform offers -> choose restaurant -> redirect.

### Food delivery
Set delivery location -> budget -> cuisine/food -> compare restaurants/platform offers -> choose deal -> redirect.

### AI search
User writes natural language -> AI extracts structured intent -> backend searches -> comparison engine ranks -> UI explains recommendation.

### Personalization
User interactions -> preferences/features -> recommendation service -> personalized results.

## 4. Non-goals for MVP
- Processing payments.
- Acting as a food delivery service.
- Guaranteeing real-time availability without a trusted data source.
- Scraping providers in ways that violate their terms.
- Building a fully autonomous AI agent that makes purchases.

## 5. Success metrics
- Search-to-result completion rate
- Result click-through rate
- Deal redirect rate
- Saved restaurant rate
- Recommendation acceptance rate
- Repeat searches
- Average effective discount surfaced

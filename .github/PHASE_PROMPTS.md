# Copilot Agent Prompts

Use one prompt at a time.

## Prompt 1 — Foundation
Read README.md, docs/ARCHITECTURE.md and docs/DEVELOPMENT_PLAN.md. Implement Phase 0 and Phase 1. Create the repository structure, frontend foundation, responsive application shell, routing, design system basics and initial home/results pages. Run lint and build. Do not implement future phases.

## Prompt 2 — Backend
Read the architecture and API specification. Implement the backend foundation with Express, MongoDB, environment validation, logging, centralized error handling and health endpoint. Add tests.

## Prompt 3 — Authentication
Implement Phase 3 according to DATABASE_SCHEMA.md and API_SPEC.md. Add registration, login, JWT authentication, protected routes and user profile. Add validation and tests. Do not add unrelated features.

## Prompt 4 — Restaurant system
Implement restaurant models, seed data, search, filtering and restaurant detail APIs. Integrate the frontend. Add loading/error/empty states.

## Prompt 5 — Deal engine
Read DEAL_ENGINE.md. Implement offer models, deterministic discount calculation, normalized platform results, deal score and comparison endpoint. Add extensive unit tests for edge cases.

## Prompt 6 — Comparison UI
Build the premium restaurant comparison interface from UI_UX_SPEC.md. Show platform-by-platform offers, effective final prices, savings and best-deal states. Add Framer Motion carefully.

## Prompt 7 — AI
Read AI_SPEC.md. Implement the AI service abstraction and natural-language search endpoint. Validate structured output. Connect it to the deterministic search/comparison engine. Do not allow AI to invent factual data.

## Prompt 8 — Personalization
Implement interaction tracking, preference aggregation and personalized recommendations. Start with transparent heuristic ranking. Keep the ranking service replaceable.

## Prompt 9 — Provider adapters
Implement the provider adapter interface and mock adapters. Add real integrations only where legally and technically supported. Never bypass authentication, access controls or provider restrictions.

## Prompt 10 — Production hardening
Run all tests, lint, builds and security checks. Fix issues. Add rate limiting, security headers, robust error handling, observability and deployment documentation.

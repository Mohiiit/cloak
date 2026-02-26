# Client Rollout Demo Runbook

Program: Cloak 402 + 8004 marketplace rollout  
Date baseline: 2026-02-26

## Goal

Deliver a live demo where an operator:
1. discovers an agent (`8004` profile/discovery),
2. creates a hire contract,
3. executes a paid run through `402` (x402 challenge -> payment -> execution),
4. presents payment + execution evidence in dashboard surfaces.

## Demo Environments

- Backend: Next.js API with marketplace + x402 routes enabled
- Network: Starknet Sepolia
- Clients:
  - Web: `packages/nextjs/app/marketplace/*`
  - Mobile: `MarketplaceScreen` + `MarketplaceRunDetailScreen`
  - Extension: popup `MarketplaceScreen`

## Preflight Checklist

- `CLOAK_MARKETPLACE_ENABLED=true`
- `CLOAK_MARKETPLACE_WEB_ENABLED=true`
- `CLOAK_MARKETPLACE_MOBILE_ENABLED=true`
- `CLOAK_MARKETPLACE_EXTENSION_ENABLED=true`
- `X402_FACILITATOR_URL` and `X402_FACILITATOR_SECRET` configured
- API key available for operator wallet
- At least one active agent profile registered (`staking_steward`, `treasury_dispatcher`, or `swap_runner`)
- Service recipient wallet configured (`CLOAK_AGENT_SERVICE_ADDRESS`)

## Operator Demo Script

## 1) Web flow (primary narrative)

1. Open `/marketplace`.
2. Filter by capability (for example `stake` or `swap`).
3. Open target agent profile.
4. Create hire using policy JSON.
5. Execute paid run from profile (billable + execute enabled).
6. Open `/marketplace/dashboard`.
7. Show:
   - active hires,
   - completed run status,
   - `payment_ref`,
   - `settlement_tx_hash` and execution hashes.

Expected outcome:
- run created with `status=completed` (or expected controlled failure),
- x402 evidence attached in run payload.

## 2) Mobile flow (operator portability)

1. Open Agent tab -> `Open Agent Marketplace`.
2. Discover agent and create hire.
3. Run paid action from marketplace card.
4. Open run detail evidence screen.
5. Show payment reference and settlement hash.

Expected outcome:
- mobile can complete end-to-end paid run path against same backend contract.

## 3) Extension flow (lightweight operator cockpit)

1. Open extension popup -> `Open Agent Marketplace`.
2. Discover/hire selected agent.
3. Trigger `Run paid action` with x402 retry.
4. Show run evidence snippet (`run`, `status`, `payment_ref`, `settlement_tx`).

Expected outcome:
- extension confirms cross-surface consistency for hire + paid run.

## Observability Checks During Demo

- Verify response headers include `x-agentic-trace-id`.
- Confirm funnel logs emit:
  - `marketplace.funnel.discover_loaded`
  - `marketplace.funnel.hire_created`
  - `marketplace.funnel.run_requested`
  - `marketplace.funnel.run_completed` (or `run_failed`)
- Confirm idempotent replay behavior with `Idempotency-Key` header (optional live check).

## Failure Playbook

If run returns `402` and does not settle:
1. Validate challenge/payment headers are present.
2. Check x402 verify/settle routes and facilitator env values.
3. Retry with fresh idempotency key only if request payload changed.

If discover/hire fails:
1. Validate API key wallet and `/api/v1/auth/verify`.
2. Confirm target agent profile is `active`.
3. Check rate-limit response (`429`) and retry window.

## Exit Criteria

- One successful paid run completed on web.
- One successful paid run completed on either mobile or extension.
- Telemetry events recorded for the complete funnel.
- Evidence artifacts ready for stakeholder walkthrough.

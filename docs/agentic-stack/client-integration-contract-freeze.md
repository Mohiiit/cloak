# Client Integration Contract Freeze (Phase 51)

Date: 2026-02-26
Owner: Cloak agentic stack

## Decision

Freeze the client-facing operator integration contract for marketplace + x402 before multi-surface rollout.

## API contract (frozen)

1. Auth:
- Every client request uses `X-API-Key`.
- API key acquisition remains `/api/v1/auth/register` + `/api/v1/auth/verify`.

2. Marketplace routes:
- `GET/POST /api/v1/marketplace/agents`
- `GET/PATCH /api/v1/marketplace/agents/[agentId]`
- `GET /api/v1/marketplace/discover`
- `GET/POST /api/v1/marketplace/hires`
- `PATCH /api/v1/marketplace/hires/[id]`
- `GET/POST /api/v1/marketplace/runs`

3. x402 routes:
- `POST /api/v1/marketplace/payments/x402/challenge`
- `POST /api/v1/marketplace/payments/x402/verify`
- `POST /api/v1/marketplace/payments/x402/settle`
- `GET /api/v1/marketplace/payments/x402/metrics`

4. Required response evidence for run lifecycle:
- `payment_ref`
- `settlement_tx_hash`
- `payment_evidence`
- `agent_trust_snapshot`

## Rollout flags (frozen)

All flags are read by backend and can be used by client gating layers:

- `CLOAK_MARKETPLACE_ENABLED` (default `true`)
- `CLOAK_MARKETPLACE_WEB_ENABLED` (default `true`)
- `CLOAK_MARKETPLACE_MOBILE_ENABLED` (default `true`)
- `CLOAK_MARKETPLACE_EXTENSION_ENABLED` (default `true`)
- `CLOAK_MARKETPLACE_RUNS_OPERATOR_SCOPING` (default `true`)
- `CLOAK_MARKETPLACE_REQUIRE_BILLABLE` (default `true`)

## Compatibility rule

No breaking field renames or enum changes are allowed from Phase 51 onward without:
1. SDK compatibility shim,
2. migration note in release docs,
3. updated tests for web/mobile/extension clients.

# x402 Gate Signoff (Phase 19)

Date: 2026-02-25
Owner: Cloak agentic stack

## Decision

x402 shielded payment rail is cleared for the next integration stage (ERC-8004 + agent marketplace).

## Checklist

- `challenge` endpoint implemented and tested.
- `verify` endpoint implemented and tested.
- `settle` endpoint implemented with replay/idempotency semantics.
- Paywall enforcement wired to billable marketplace runs.
- SDK client helpers and retry helper (`x402Fetch`) aligned with backend header requirements.
- Metrics and runbook are available for operations.
- Route, unit, integration, e2e, and security/reliability tests are passing.

## Evidence

- Unit:
  - `packages/nextjs/lib/marketplace/x402/facilitator.test.ts`
  - `packages/sdk/tests/x402.test.ts`
- Integration:
  - `packages/nextjs/app/api/v1/__tests__/x402.integration.test.ts`
- E2E:
  - `packages/nextjs/app/api/v1/__tests__/x402.e2e.test.ts`
- Security/Reliability:
  - `packages/nextjs/app/api/v1/__tests__/x402.security-reliability.test.ts`
- Operational:
  - `packages/nextjs/app/api/v1/marketplace/payments/x402/metrics/route.ts`
  - `docs/agentic-stack/x402-runbook.md`

## Commands used in this gate

```bash
yarn workspace @cloak-wallet/sdk test x402.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/x402.integration.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/x402.e2e.test.ts
yarn workspace @ss-2/nextjs test app/api/v1/__tests__/x402.security-reliability.test.ts
```

## Open Follow-up (non-blocking)

- Persist x402 metrics to a durable sink for production analytics.
- Add load-test harness against a deployed facilitator on Sepolia.

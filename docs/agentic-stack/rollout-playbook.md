# Staged Rollout Playbook

Program: Cloak marketplace (`8004`) + x402 paid runs (`402`)

## Rollout Strategy

Roll out by surface and risk tier instead of enabling all clients simultaneously.

## Stage 0: Internal Dry Run

- Flags:
  - `CLOAK_MARKETPLACE_ENABLED=true`
  - `CLOAK_MARKETPLACE_WEB_ENABLED=true`
  - `CLOAK_MARKETPLACE_MOBILE_ENABLED=false`
  - `CLOAK_MARKETPLACE_EXTENSION_ENABLED=false`
- Audience: core team wallets only
- Required checks:
  - funnel telemetry visible
  - idempotency replay verified
  - x402 challenge/settle path healthy

## Stage 1: Web Operator Beta

- Flags:
  - `CLOAK_MARKETPLACE_WEB_ENABLED=true`
  - `CLOAK_MARKETPLACE_MOBILE_ENABLED=false`
  - `CLOAK_MARKETPLACE_EXTENSION_ENABLED=false`
- Audience: 5-10 trusted operators
- Guardrails:
  - strict monitoring for run failures
  - manual review of paid run evidence

## Stage 2: Mobile Beta

- Flags:
  - `CLOAK_MARKETPLACE_MOBILE_ENABLED=true`
- Audience: selected mobile testers
- Guardrails:
  - marketplace API test suite must stay green
  - successful paid run evidence on mobile required

## Stage 3: Extension Beta

- Flags:
  - `CLOAK_MARKETPLACE_EXTENSION_ENABLED=true`
- Audience: selected extension users
- Guardrails:
  - extension typecheck/build must pass
  - confirm parity for discover/hire/run actions

## Stage 4: Public Beta

- Flags:
  - all marketplace flags enabled
- Audience: open beta cohort
- Guardrails:
  - rate limits enforced
  - idempotency key behavior documented for integrators
  - incident response on-call active

## Metrics and Thresholds

- `marketplace.funnel.run_failed / marketplace.funnel.run_requested` < 5%
- `x402` verify/settle failure ratio < 2%
- `429` rate-limit responses stable and non-abusive
- no unresolved high-severity incidents for 24h before stage promotion

## Rollback Rules

Trigger immediate stage rollback if any of the following occur:

- repeated x402 settlement failures
- persistent run execution failures above threshold
- inability to replay safely with idempotency keys
- privacy/payment evidence mismatches

Rollback actions:

1. Disable affected surface flag (`WEB`, `MOBILE`, or `EXTENSION`).
2. Keep marketplace backend active for healthy surfaces.
3. Publish incident status + expected remediation timeline.
4. Re-run stage test matrix before re-enable.

## Change Management

- Every stage promotion requires:
  - latest test matrix evidence document,
  - named owner on call,
  - rollback command path documented,
  - checkpoint in `phase-tracker.md`.

# Post-Phase-50 Cross-Surface Test Matrix

Execution date: 2026-02-26

## Matrix

| Surface | Scope | Command | Result | Notes |
| --- | --- | --- | --- | --- |
| Next.js backend | Marketplace API funnel + telemetry + idempotency | `yarn workspace @ss-2/nextjs test marketplace.funnel.test.ts marketplace.telemetry.route.test.ts marketplace.registry.route.test.ts marketplace.runs.route.test.ts` | pass | `4` test files, `12` tests passed |
| SDK | Marketplace session + x402 proof provider | `yarn workspace @cloak-wallet/sdk test marketplace-session.test.ts x402.proof-provider.test.ts` | pass | `2` test files, `4` tests passed |
| Mobile | Marketplace API + agent API regression | `yarn workspace CloakMobile test marketplaceApi.test.ts agentApi.test.ts` | pass | `2` test files, `8` tests passed |
| Extension | Typecheck | `yarn workspace @cloak/extension exec tsc --noEmit` | pass | Marketplace extension changes are type-safe |
| Extension | Production build | `yarn workspace @cloak/extension build` | pass | Fixed by SDK export map change (`import` -> `dist/index.mjs`) and extension ward hook import hardening |

## Gate Summary

- Backend, SDK, mobile, and extension integration checks are green for the 402+8004 marketplace stack.
- Extension production bundling now passes after resolving the SDK ESM export mapping issue.

## Follow-up Action

1. Keep SDK export map stable:
   - `packages/sdk/package.json` should continue to map ESM `import` to `dist/index.mjs`.
2. Re-run extension build after SDK release updates:
   - `yarn workspace @cloak/extension build`

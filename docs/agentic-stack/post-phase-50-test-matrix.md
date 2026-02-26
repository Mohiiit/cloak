# Post-Phase-50 Cross-Surface Test Matrix

Execution date: 2026-02-26

## Matrix

| Surface | Scope | Command | Result | Notes |
| --- | --- | --- | --- | --- |
| Next.js backend | Marketplace API funnel + telemetry + idempotency | `yarn workspace @ss-2/nextjs test marketplace.funnel.test.ts marketplace.telemetry.route.test.ts marketplace.registry.route.test.ts marketplace.runs.route.test.ts` | pass | `4` test files, `12` tests passed |
| SDK | Marketplace session + x402 proof provider | `yarn workspace @cloak-wallet/sdk test marketplace-session.test.ts x402.proof-provider.test.ts` | pass | `2` test files, `4` tests passed |
| Mobile | Marketplace API + agent API regression | `yarn workspace CloakMobile test marketplaceApi.test.ts agentApi.test.ts` | pass | `2` test files, `8` tests passed |
| Extension | Typecheck | `yarn workspace @cloak/extension exec tsc --noEmit` | pass | Marketplace extension changes are type-safe |
| Extension | Production build | `yarn workspace @cloak/extension build` | fail | Pre-existing blocker: `checkIfWardAccount` missing export in `src/popup/hooks/useWard.ts` from `../sdk/dist/index.js` |

## Gate Summary

- Backend, SDK, and mobile integration tests are green for the 402+8004 marketplace stack.
- Extension marketplace logic compiles (`tsc`) but full production bundling remains blocked by an unrelated pre-existing SDK export mismatch in ward hooks.
- Release gate should treat extension `vite build` as a known blocker outside phase-73 changes until the SDK export mismatch is fixed.

## Follow-up Action

1. Fix extension ward import/export mismatch:
   - File currently failing: `packages/extension/src/popup/hooks/useWard.ts`
   - Missing symbol: `checkIfWardAccount` from `packages/sdk/dist/index.js`
2. Re-run:
   - `yarn workspace @cloak/extension build`
3. Mark matrix fully green after build passes.

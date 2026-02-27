# x402 <> ERC-8004 Combined Gate Signoff (Phase 83)

Date: 2026-02-26
Owner: Cloak agentic stack

## Decision

`x402 + ERC-8004 + staking_steward` is cleared for on-chain demo use with real settlement and real execution on Sepolia.

## What was validated

- On-chain identity enforcement enabled in production:
  - `MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY=true`
- Real paid run path:
  - `POST /api/v1/marketplace/runs` with x402 challenge/settlement retry.
- Real 8004-aligned marketplace flow:
  - register/refresh agent profile
  - hire agent
  - execute paid run
- Real protocol execution:
  - staking action submits Starknet tx via backend execution adapter.
- No mocks/simulated settlement used in the live matrix test.

## Live evidence (Sepolia)

- Deployment alias:
  - `https://cloak-backend-vert.vercel.app`
- Live E2E test:
  - `packages/nextjs/app/api/v1/__tests__/marketplace.x402-erc8004.live.sepolia.test.ts`
- Successful run evidence:
  - settlement tx hash: `0x3b54628ef559f2967d2b8efe990681cde9d0c5aea52c4dd2f873bb21c4899c5`
  - execution tx hash: `0x6edf0f6104b07f1867a13926a88f945207fd8316e4e277f22b2a68ba1c4098`
  - receipt checks: `execution_status=SUCCEEDED`, `finality_status=ACCEPTED_ON_L2`

## Test evidence

- Live E2E (real chain):
  - `yarn workspace @ss-2/nextjs test app/api/v1/__tests__/marketplace.x402-erc8004.live.sepolia.test.ts`
- On-chain identity enforcement unit/integration:
  - `yarn workspace @ss-2/nextjs test app/api/v1/__tests__/marketplace.onchain-identity-enforcement.test.ts app/api/v1/__tests__/marketplace.onchain-write.route.test.ts`
- Basic protocol adapter unit:
  - `yarn workspace @ss-2/nextjs test lib/marketplace/basic-protocol-adapter.test.ts`

## Notes

- Production signer credentials had newline suffix artifacts; backend signer config now sanitizes escaped/newline characters before account construction.
- Staking execution now handles existing staker accounts by switching `stake -> increase_stake` when position already exists.

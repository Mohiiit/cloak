# Sepolia Role Topology Template (Phase 04)

Date: 2026-02-25

## Role Map
Set these environment variables before live e2e phases:

1. `CLOAK_OPERATOR_PK`
2. `CLOAK_OPERATOR_ADDRESS`
3. `CLOAK_GUARDIAN_PK`
4. `CLOAK_GUARDIAN_ADDRESS`
5. `CLOAK_AGENT_SERVICE_PK`
6. `CLOAK_AGENT_SERVICE_ADDRESS`
7. `CLOAK_TREASURY_PK`
8. `CLOAK_TREASURY_ADDRESS`
9. `CLOAK_PAYER_PK`
10. `CLOAK_PAYER_ADDRESS`
11. `CLOAK_ATTACKER_PK` (negative security tests)
12. `CLOAK_ATTACKER_ADDRESS`

## Ward Topology
1. Operator account may have guardian gating for high-risk runs.
2. Guardian threshold should be configured per agent type:
- Staking Steward: threshold for large stake/unstake.
- Treasury Dispatcher: threshold for batch notional.
- Swap Runner: threshold for high notional swaps.

## RPC Setup
1. `CLOAK_SEPOLIA_RPC_URL`
2. `CLOAK_SEPOLIA_RPC_FALLBACK_URL` (optional)

## Security Rules
1. Never commit private keys.
2. Use `.env.local` for developer machines.
3. Use secret manager in CI.

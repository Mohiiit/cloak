# x402 Operations Runbook (Phase 14)

## Purpose
Operational guide for Cloak x402 payment rails in marketplace execution flows.

## Key Endpoints
1. `POST /api/v1/marketplace/payments/x402/challenge`
2. `POST /api/v1/marketplace/payments/x402/verify`
3. `POST /api/v1/marketplace/payments/x402/settle`
4. `POST /api/v1/marketplace/payments/x402/reconcile` (secret-protected)
5. `GET /api/v1/marketplace/payments/x402/metrics`
6. `POST /api/v1/marketplace/runs` (paywall-protected billable path)

## Primary Signals
1. `challenge_issued`
2. `verify_accepted`
3. `verify_rejected`
4. `settle_settled`
5. `settle_pending`
6. `settle_failed`
7. `settle_rejected`
8. `replay_pending`
9. `replay_settled`
10. `replay_rejected`
11. `paywall_required`
12. `paywall_paid`

## Incident Playbook
1. If `verify_rejected` spikes:
- inspect malformed payload rates,
- verify challenge signature secret parity across envs.

2. If `settle_rejected` spikes:
- inspect replay store writes (`x402_payments`),
- validate challenge expiry windows,
- inspect strict proof envelope mismatches (`intentHash`, `settlementTxHash`).

3. If `paywall_required` is high but `paywall_paid` is low:
- inspect client retry/x402 header behavior,
- verify challenge header propagation.

4. If settlements remain pending:
- verify `X402_VERIFY_ONCHAIN_SETTLEMENT` and RPC health,
- inspect settlement tx receipt finality (`ACCEPTED_ON_L2/L1`),
- run reconciliation loop for stuck pending rows:
  `POST /api/v1/marketplace/payments/x402/reconcile` with `Authorization: Bearer $X402_RECONCILE_SECRET`.

5. If `pending_payment` runs accumulate:
- reconcile x402 pending rows first,
- ensure `payment_ref` joins between `x402_payments` and `agent_runs`,
- verify basic runtime signer config (`MARKETPLACE_RUNTIME_PROTOCOL=basic` + `BASIC_PROTOCOL_SIGNER_*`, include secondary key if 2FA-enabled signer),
- if running optional StarkZap mode, verify `STARKZAP_EXECUTOR_URL` and layer target wiring (`STARKZAP_LAYER_MODE`, `STARKZAP_LAYER_TARGET_URL`).

## Immediate Mitigations
1. Rotate `X402_FACILITATOR_SECRET` if signature mismatch is suspected.
2. Temporarily increase `X402_PAYMENT_EXPIRY_SECONDS` during high latency events.
3. Enable fallback RPC for settlement recovery.
4. Keep strict verifier controls enabled (`X402_TONGO_CRYPTO_VERIFY=true`, `X402_REQUIRE_TONGO_PROOF_BUNDLE=true`).
5. If runtime execution fails, fix basic signer/RPC config first; do not enable simulated execution.

## Basic On-Chain Smoke
Run this before release when validating non-mocked execution:

`BASIC_PROTOCOL_LIVE=1 yarn workspace @ss-2/nextjs test lib/marketplace/basic-protocol-adapter.live.sepolia.test.ts`

Required env:
- `CLOAK_SEPOLIA_RPC_URL` (or `NEXT_PUBLIC_SEPOLIA_PROVIDER_URL`)
- `BASIC_PROTOCOL_SIGNER_ADDRESS`
- `BASIC_PROTOCOL_SIGNER_PRIVATE_KEY`
- `BASIC_PROTOCOL_LIVE_CALLS_JSON` (non-empty JSON call array)
- `BASIC_PROTOCOL_SIGNER_SECONDARY_PRIVATE_KEY` when signer account has 2FA enabled

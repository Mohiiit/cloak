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
- verify `MARKETPLACE_STRICT_ONCHAIN_EXECUTION` / `STARKZAP_EXECUTOR_URL` config.

## Immediate Mitigations
1. Rotate `X402_FACILITATOR_SECRET` if signature mismatch is suspected.
2. Temporarily increase `X402_PAYMENT_EXPIRY_SECONDS` during high latency events.
3. Enable fallback RPC for settlement recovery.
4. Toggle compatibility flags during controlled rollback:
- `X402_LEGACY_PROOF_COMPAT`
- `X402_LEGACY_SETTLEMENT_COMPAT`
5. For emergency execution rollback:
- set `STARKZAP_ALLOW_SIMULATED_EXECUTION=true`,
- disable strict execution gate (`MARKETPLACE_STRICT_ONCHAIN_EXECUTION=false`).

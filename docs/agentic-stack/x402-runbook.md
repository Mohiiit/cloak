# x402 Operations Runbook (Phase 14)

## Purpose
Operational guide for Cloak x402 payment rails in marketplace execution flows.

## Key Endpoints
1. `POST /api/v1/marketplace/payments/x402/challenge`
2. `POST /api/v1/marketplace/payments/x402/verify`
3. `POST /api/v1/marketplace/payments/x402/settle`
4. `GET /api/v1/marketplace/payments/x402/metrics`
5. `POST /api/v1/marketplace/runs` (paywall-protected billable path)

## Primary Signals
1. `challenge_issued`
2. `verify_accepted`
3. `verify_rejected`
4. `settle_settled`
5. `settle_rejected`
6. `paywall_required`
7. `paywall_paid`

## Incident Playbook
1. If `verify_rejected` spikes:
- inspect malformed payload rates,
- verify challenge signature secret parity across envs.

2. If `settle_rejected` spikes:
- inspect replay store writes (`x402_payments`),
- validate challenge expiry windows.

3. If `paywall_required` is high but `paywall_paid` is low:
- inspect client retry/x402 header behavior,
- verify challenge header propagation.

## Immediate Mitigations
1. Rotate `X402_FACILITATOR_SECRET` if signature mismatch is suspected.
2. Temporarily increase `X402_PAYMENT_EXPIRY_SECONDS` during high latency events.
3. Enable fallback RPC for settlement recovery.


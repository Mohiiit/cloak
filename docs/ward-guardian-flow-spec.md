# Ward/Guardian Transaction Flow Spec

## Purpose

Define one canonical flow for ward transactions across:

- Mobile app (ward device + guardian device)
- Web app
- Extension

This spec is the source of truth for routing, signature requirements, status transitions, and expected UI prompts.

## Entities

- `Ward primary signature`: signature by ward account private key.
- `Ward 2FA signature`: signature by ward secondary key (if ward 2FA enabled).
- `Guardian primary signature`: signature by guardian account private key.
- `Guardian 2FA signature`: signature by guardian secondary key (if guardian 2FA enabled).

## Signature Matrix (Canonical)

| Ward 2FA | Guardian 2FA | Required chain |
|---|---|---|
| Off | Off | Ward primary -> Guardian primary -> Execute |
| On | Off | Ward primary + Ward 2FA -> Guardian primary -> Execute |
| Off | On | Ward primary -> Guardian primary + Guardian 2FA -> Execute |
| On | On | Ward primary + Ward 2FA -> Guardian primary + Guardian 2FA -> Execute |

Notes:

- Ward primary signature is always required for ward-originated transactions.
- Guardian signatures are required whenever `needs_guardian=true`.

## Routing by Origin

### 1) Local ward-mobile initiated transaction

Definition: user starts tx from ward mobile app UI.

- If `ward2FA=false`: ward primary signing is done inline automatically.
  - Do **not** show a redundant Ward Signing modal on same device.
  - Request advances directly to guardian stage when `needs_guardian=true`.
- If `ward2FA=true`: show ward signing/biometric step on ward mobile.

### 2) Remote initiated transaction (web/extension)

Definition: tx starts from ward web or extension.

- Always create request in `pending_ward_sig`.
- Ward mobile must handle ward signing stage first.
- Then guardian stage if `needs_guardian=true`.

## Status Machine (`ward_approval_requests`)

Primary states:

- `pending_ward_sig`
- `pending_guardian`
- `approved`
- `rejected`
- `failed`
- `gas_error`

Transitions:

- `pending_ward_sig -> pending_guardian` after ward signatures are stored and guardian is required.
- `pending_ward_sig -> approved` only when guardian is not required and tx executes successfully.
- `pending_guardian -> approved` after guardian signatures + successful on-chain execution.
- Any pending state -> `rejected` on explicit reject.
- Any execution/signing failure -> `failed`.
- Guardian submission fee/resource shortfall -> `gas_error` (retry path).

## Device Responsibilities

### Ward device

- Deserialize calls.
- Estimate fee/resource bounds.
- Fetch nonce.
- Compute tx hash.
- Produce ward primary signature and optional ward 2FA signature.
- Update request row with computed data and advance status.

### Guardian device

- Read tx hash + ward signatures from row.
- Produce guardian primary signature and optional guardian 2FA signature.
- Assemble full signature chain in canonical order.
- Submit tx on-chain and persist final status/tx hash.

## Fee Estimation Contract

Ward-side fee estimation must:

- Support canonical RPC param shape and fallback shapes for provider compatibility.
- Try `block_id` values in this order: `pre_confirmed`, then `latest`.
- Parse both modern and legacy fee response fields.
- Reject all-zero resource estimates (never submit zero resource bounds).

## UX Rules

- No duplicate modal loops.
- A stage prompt must appear only on the device responsible for that stage.
- If ward 2FA is disabled, ward local tx must not ask for ward 2FA prompt.

## Test Matrix Minimum

For each of `shield`, `unshield`, `transfer`, `claim` where applicable:

1. Accept path for all four matrix rows.
2. Reject at ward stage (when ward stage exists).
3. Reject at guardian stage.
4. Fee estimation fallback path (`pre_confirmed`/`latest`) and retry.


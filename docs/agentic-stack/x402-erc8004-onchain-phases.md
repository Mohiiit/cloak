# x402 <> ERC-8004 On-Chain Phases (Execution Plan)

Program date: 2026-02-26
Scope: complete on-chain identity binding between ERC-8004 marketplace lifecycle and x402 paid runs.

## Exit goal

`POST /marketplace/agents` + `POST /marketplace/hires` + `POST /marketplace/runs` are chain-authoritative for identity checks, and x402 settlement is bound to the resolved on-chain owner/service identity for the hired agent.

## Phase breakdown

### Phase 1: SDK on-chain write lifecycle

- Add signer-backed ERC-8004 invoke surface in SDK.
- Add tx confirmation/wait helper.
- Add env-gated live Sepolia smoke test for write tx execution.

Completion criteria:
- SDK can submit an identity-registry write tx and return tx hash + receipt.

### Phase 2: Backend identity enforcement gate

- Add shared on-chain identity validator module.
- Enforce identity checks at register/hire/run boundaries when flag is enabled.
- Return explicit failure code when identity mismatch occurs.

Completion criteria:
- Hires and billable runs are blocked under enforcement if on-chain owner mismatches operator wallet.

### Phase 3: x402 identity binding hardening

- Bind challenge context to resolved on-chain identity snapshot fields.
- Validate that paid run executes against the same identity snapshot.
- Add mismatch tests in runs and crosslink suites.

Completion criteria:
- Reusing a valid x402 payment against a mismatched identity fails closed.

### Phase 4: Chain-first registration writes

- Enable optional chain write on agent registration.
- Persist on-chain write outcome (`pending/confirmed/failed`) and tx hash.
- Add retry/reconciliation hooks for pending txs.

Completion criteria:
- Agent registration responses include deterministic on-chain write outcome classification.

### Phase 5: Release gate + live matrix

- Run unit/integration/e2e suites for SDK and nextjs.
- Run live Sepolia smoke for ERC-8004 tx path and x402 settlement path.
- Publish signoff doc and rollback toggles.

Completion criteria:
- Dedicated x402<>8004 gate signoff is green.

## Feature flags and env contract additions

- `MARKETPLACE_REQUIRE_ONCHAIN_IDENTITY` (`false` default)
- `ERC8004_OWNER_ENTRYPOINT` (`owner_of` default)
- `ERC8004_WRITE_ENABLED` (`false` default)
- `ERC8004_WRITE_ENTRYPOINT` (write ABI-specific)
- `ERC8004_SIGNER_ADDRESS`
- `ERC8004_SIGNER_PRIVATE_KEY`

## Immediate execution order (this cycle)

1. Phase 1 implementation and tests.
2. Phase 2 enforcement wiring and tests.
3. Run targeted suites, then widen to full gate.

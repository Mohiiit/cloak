# Agentic Stack Scope Freeze (Phase 01)

Date: 2026-02-25
Owner: Codex + Mohit

## Objective
Build and ship end-to-end agent marketplace infrastructure in Cloak with:
1. Shielded x402 payment rail.
2. ERC-8004 identity/discovery/trust layer.
3. Three production showcase agents:
- Staking Steward
- Treasury Dispatcher
- Swap Runner

## In Scope
1. SDK contracts for x402 and marketplace lifecycle.
2. Next.js backend APIs for discovery, hire, payment verification/settlement, and run execution.
3. Policy + Ward/guardian gate enforcement for agent execution.
4. Starkzap-centered execution adapter interfaces and runtime wiring.
5. Marketplace user flows to discover, hire, and run agents.
6. Unit, integration, e2e, security, reliability, and performance tests.

## Out of Scope (Current Program)
1. Cross-chain expansion beyond Starknet Sepolia/Mainnet.
2. Full legal/compliance policy engine automation.
3. Production cloud deployment scripts for external infrastructure vendors.

## Success Criteria
1. People can discover agents from marketplace APIs/UI.
2. People can hire agents with persisted contracts and policy snapshots.
3. Billable runs require x402 private settlement before execution.
4. Runs execute with Starkzap adapter paths and are policy-safe.
5. Tests pass across all mandatory gates.

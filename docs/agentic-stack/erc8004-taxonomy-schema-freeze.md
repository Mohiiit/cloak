# ERC-8004 Taxonomy + Schema Freeze (Phase 20)

Date: 2026-02-25

## Scope

This freeze locks the API taxonomy used by Cloak marketplace profile/discovery/hiring flows.

## Canonical agent types

- `staking_steward`
- `treasury_dispatcher`
- `swap_runner`

## Canonical pricing modes

- `per_run`
- `subscription`
- `success_fee`

## Canonical profile status

- `active`
- `paused`
- `retired`

## Canonical hire status

- `active`
- `paused`
- `revoked`

## Frozen contracts

- SDK types:
  - `AgentEndpointOwnershipProof`
  - `AgentTrustSummary`
  - `RegisterAgentRequest`
  - `AgentProfileResponse`
  - `CreateAgentHireRequest`
  - `AgentHireResponse`
- Backend validation:
  - `RegisterAgentSchema`
  - `DiscoverAgentsQuerySchema`
  - `CreateAgentHireSchema`
  - `UpdateAgentHireSchema`
  - `AgentEndpointProofSchema`

## Compatibility notes

- Existing x402 flow remains unchanged.
- Optional registry fields are additive and backward compatible for existing clients.

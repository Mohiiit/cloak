# Selector Guide

## Contract

Selectors are defined in:

- `packages/mobile/src/testing/testIDs.ts`

Naming format:

- `screen.section.element.action`
- lowercase + dot-separated

## Required Domains

- `onboarding.*`
- `deploy.*`
- `home.*`
- `send.*`
- `wallet.*`
- `settings.*`
- `ward.*`
- `approval.*`
- `toast.*`
- `nav.*`

## Compatibility Aliases

Legacy aliases remain available while migrating older flows/components:

- `navigation.*`
- `approvalModal.*`
- `wardApprovalModal.*`
- `guardianApprovalModal.*`

## State Markers

Deterministic marker IDs are stable and machine-readable:

- `ward.creation.step` (example value: `ward.creation.step=4`)
- `ward.creation.status` (example value: `ward.creation.status=in_progress`)
- `deploy.status` (example value: `deploy.status=deployed`)
- `approval.queue.count` (example value: `approval.queue.count=2`)
- `transaction.router.path` (`direct`, `ward`, `2fa`, `ward+2fa`)
- `toast.last.type` (`none`, `success`, `warning`, `error`, `info`)

## Rules For New UI Work

1. Add selector IDs in `testIDs.ts` before wiring UI.
2. Use `testProps(testID)` on all interactive controls.
3. Avoid duplicate visible labels when controls have similar copy.
4. Prefer selector assertions in Maestro over text assertions.
5. Keep IDs stable; do not rename without updating matrix docs and flows.

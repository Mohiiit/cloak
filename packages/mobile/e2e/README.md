# Cloak Mobile E2E

This folder contains deterministic mobile testing assets for Android and iOS.

## Stack

- Maestro for user-journey automation.
- RNTL/Jest for local deterministic unit/integration checks.
- Hybrid runtime strategy:
  - `e2e-mock` (primary CI gate, deterministic)
  - `e2e-live` (nightly smoke against live Sepolia dependencies)

## Layout

- `maestro/config.yaml`: profile map for Android/iOS mock/live entries.
- `maestro/flows/shared`: reusable subflows.
- `maestro/flows/setup`: setup and onboarding/deploy/bootstrap flows.
- `maestro/flows/core`: platform matrix entrypoints + core scenarios.
- `maestro/flows/ward`: guardian/ward approval scenarios.
- `maestro/flows/twofa`: ward and guardian 2FA scenario matrix.
- `maestro/flows/regressions`: resilience and retry regressions.
- `artifacts/<run-id>/<platform>/...`: screenshots, logs, junit output.

## Run Commands

From repo root:

```bash
yarn mobile:test:unit
yarn mobile:test:e2e:android:mock
yarn mobile:test:e2e:ios:mock
yarn mobile:test:e2e:live-smoke
yarn mobile:test:all:mock
```

From `packages/mobile`:

```bash
yarn test:unit
yarn test:e2e:android:mock
yarn test:e2e:ios:mock
yarn test:e2e:live-smoke
yarn test:all:mock
```

## Artifacts

Each runner writes to:

- `packages/mobile/e2e/artifacts/<run-id>/android`
- `packages/mobile/e2e/artifacts/<run-id>/ios`

The scripts capture:

- `maestro.log`
- `maestro-junit.xml`
- build/install logs (`gradle.log`, `xcodebuild.log`, `simctl-install.log`)
- debug artifacts where supported by installed Maestro (`debug/`)

## Runtime Modes

- `prod`: default app behavior.
- `e2e-mock`: deterministic suite with mock bridge/approval backends.
- `e2e-live`: integration smoke suite.

## CI Gate Policy

- Required on PRs: `mobile:test:unit` + Android/iOS mock matrix suites.
- Non-blocking: nightly live smoke jobs.

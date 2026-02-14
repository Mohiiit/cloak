# Mobile Test Matrix

## Setup Baseline

1. Onboarding create/import/clear-data flow.
2. Deploy flow with success + retry checkpoints.
3. Guardian ward creation with progress markers.
4. Ward import on second device.

## Core Transaction Matrix

1. Guardian shield transaction path.
2. Guardian unshield transaction path.
3. Guardian send-to-ward transaction path.
4. Ward claim pending funds path.
5. Ward-initiated transaction requiring guardian approval.
6. Guardian approve path.
7. Guardian reject path.

## 2FA Matrix

1. Ward 2FA enabled:
   - reject at ward stage
   - accept ward + reject guardian
   - accept all
2. Ward + guardian 2FA enabled:
   - reject at guardian 2FA stage
   - accept full multi-signature path

## Regression Matrix

1. Fee estimation boundary + retry path.
2. Network interruption/resume during approval polling.
3. App background/foreground while requests are pending.

## Marker Assertions (machine-readable)

- `ward.creation.step`
- `ward.creation.status`
- `deploy.status`
- `approval.queue.count`
- `transaction.router.path`
- `toast.last.type`

## Platform Coverage

- Android emulator: full `e2e-mock` matrix + live smoke.
- iOS simulator: full `e2e-mock` matrix + live smoke.

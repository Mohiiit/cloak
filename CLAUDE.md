# Cloak - Privacy Wallet for Starknet

## Overview

Cloak is a production-grade privacy wallet for Starknet that enables shielded payments using the Tongo SDK (ElGamal encryption + ZK proofs). It consists of three frontends (web, Chrome extension, mobile), a shared SDK, and on-chain Cairo smart contracts for account abstraction with optional two-factor authentication and guardian-controlled sub-accounts (wards).

## Monorepo Structure

```
cloak/
├── packages/
│   ├── sdk/           @cloak-wallet/sdk — Shared TypeScript library (tokens, wallet, 2FA, ward, Supabase)
│   ├── nextjs/        Next.js 15 web app (React 19, Tailwind, starknet-react)
│   ├── extension/     Chrome Extension (Manifest V3, Vite, React 18)
│   ├── mobile/        React Native 0.83 (WebView bridge to Tongo SDK)
│   └── snfoundry/     Cairo smart contracts (CloakAccount, CloakWard)
├── docs/
│   ├── BUILD_PLAN.md  6-phase build plan with task tracking
│   ├── research.md    Technical research notes
│   └── screenshots/   App screenshots (mobile, extension, web)
├── package.json       Root workspace config (npm workspaces)
├── LICENSE            Apache License 2.0
└── README.md          Project overview
```

## Workspace Dependencies

All frontends depend on `@cloak-wallet/sdk` via `workspace:*`. The SDK must be built first before any frontend.

**Build order:**
1. `packages/sdk` (must build first — all frontends import from it)
2. Everything else can build in parallel

## Key Scripts (Root)

```bash
npm run sdk:build        # Build SDK (tsup → CJS + ESM + types)
npm run sdk:test         # Run SDK unit tests (vitest)
npm run extension:build  # Build extension (vite)
npm run extension:dev    # Watch-build extension
npm run start            # Start Next.js dev server (port 3000)
npm run compile          # Compile Cairo contracts (scarb)
npm run deploy           # Deploy contracts to Starknet
npm run test             # Run Cairo contract tests (snforge)
```

## Architecture

### Three Frontends, One SDK

All three frontends share the same SDK for:
- RPC URLs, contract class hashes, Supabase credentials (`config.ts`)
- Token configurations with conversion rates (`tokens.ts`)
- Wallet creation and address computation (`wallet.ts`, `keys.ts`)
- 2FA approval polling pipeline (`two-factor.ts`)
- Ward/guardian utilities and fee estimation (`ward.ts`)
- Lightweight Supabase client (`supabase.ts`)

### Transaction Flow

```
User initiates tx on Web/Extension/Mobile
  → Check if ward account → route through guardian approval
  → Check if 2FA enabled → route through mobile approval
  → Otherwise → direct account.execute()
```

### Signature Chain (Ward + 2FA)

```
[ward_primary_sig, ward_2fa_sig?, guardian_sig?, guardian_2fa_sig?]
= 2 to 8 felt252 values depending on which 2FA keys are active
```

### Off-Chain Coordination (Supabase)

Supabase PostgreSQL tables coordinate cross-device signing:
- `two_factor_configs` — 2FA registration (wallet → secondary public key)
- `approval_requests` — 2FA approval pipeline (web/ext → mobile polling)
- `ward_configs` — Ward registration (guardian → ward mapping)
- `ward_invites` — Ward invite codes for importing on mobile
- `ward_approval_requests` — Ward multi-sig pipeline (ward → guardian signing)

## Smart Contracts (Cairo)

### CloakAccount (`packages/snfoundry/contracts/src/cloak_account.cairo`)
- **Class hash** (Sepolia): `0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00`
- SRC6 account standard with optional secondary key (2FA)
- Signature: `[r1, s1]` (single) or `[r1, s1, r2, s2]` (dual)
- Self-managed: `set_secondary_key()`, `remove_secondary_key()`

### CloakWard (`packages/snfoundry/contracts/src/cloak_ward.cairo`)
- **Class hash** (Sepolia): `0x3baf915f503ee7ce22d06d78c407dc2f26ee18d8fa8cf165886e682da5a1132`
- **CASM hash** (Sepolia): `0x657bb2d68a7126505cb6ff37bd8ff4622949becdf1b83d41a66c6e445f2c858`
- Immutably linked to a guardian CloakAccount
- Guardian controls: freeze, spending limits, known token whitelist
- `get_account_type()` returns `0x57415244` ("WARD")

## Token Configuration

| Token | Rate (1 Tongo unit =) | ERC-20 Decimals |
|-------|----------------------|-----------------|
| STRK  | 0.05 STRK            | 18              |
| ETH   | 0.000003 ETH         | 18              |
| USDC  | 0.01 USDC            | 6               |

## Critical Rules

### Gas Estimation
- **NEVER hardcode gas values.** Always estimate dynamically.
- Use `estimateWardInvokeFee()` with `SKIP_VALIDATE` for CloakWard and CloakAccount+2FA.
- Standard `estimateInvokeFee()` fails on these account types.

### Pre-Computed Signatures
- **MUST pass `tip: 0`** to `account.execute()` when using pre-computed signatures.
- starknet.js v8 auto-estimates tip, causing hash mismatch.

### On-Chain Integrity
- Off-chain state (Supabase) must always be consistent with on-chain state.
- Never mark 2FA as "enabled" if the on-chain `set_secondary_key` tx failed.
- Always `waitForTransaction()` and check `execution_status` for reverts.

### starknet.js v8
- Account constructor: `new Account({provider, address, signer})` (object pattern, NOT positional)
- Mobile has starknet 8.9.2, SDK has 8.5.3 — use `provider as any` when passing cross-package.

## Environment Setup

### Build Environment
- **JDK**: `/opt/homebrew/opt/openjdk@17`
- **Android SDK**: `~/Library/Android/sdk`
- **Physical device**: Samsung (adb `2B091JEGR01466`)
- **Metro port**: 8081 (`adb reverse tcp:8081 tcp:8081`)
- **iOS simulator**: iPhone 17 Pro (UUID `16B9D337-2D73-4618-999B-EC929D618075`)

### Environment Variables
- SDK: `.env` with `RPC_URL`, `FUNDER_PK`, `FUNDER_ADDRESS`, `GUARDIAN_PK`, etc.
- Next.js: `.env` with `NEXT_PUBLIC_SEPOLIA_PROVIDER_URL`
- SnFoundry: `.env` with `PRIVATE_KEY_SEPOLIA`, `RPC_URL_SEPOLIA`

## Full Rebuild Checklist

1. `cd packages/sdk && npm run build`
2. (Parallel from here) `cd packages/extension && npx vite build`
3. `cd packages/nextjs && npx next build`
4. `cd packages/mobile/android && JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=~/Library/Android/sdk ./gradlew assembleDebug`
5. `adb install -r packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
6. `cd packages/mobile && npx react-native start --port 8081` + `adb reverse tcp:8081 tcp:8081`
7. `cd packages/mobile && npx react-native run-ios --simulator="iPhone 17 Pro"`

## Key Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| starknet | 8.5.3 | Starknet.js for on-chain operations |
| @fatsolutions/tongo-sdk | ^1.3.1 | Privacy/shielding via ElGamal + ZK proofs |
| react | 19.x | UI framework (web + mobile) |
| next | 15.2.6 | Web app framework |
| react-native | 0.83.1 | Mobile framework |
| vite | 5.x | Extension bundler |
| tsup | 8.x | SDK bundler (CJS + ESM) |
| scarb | 2.15+ | Cairo compiler |

## Testing

- **SDK unit tests**: `cd packages/sdk && npm test` (vitest, 28 tests)
- **SDK E2E**: `cd packages/sdk && node e2e-test.cjs` (9 steps on Sepolia)
- **Cairo tests**: `cd packages/snfoundry && snforge test`
- **Ward E2E**: `cd packages/sdk && node test-ward-approval.cjs`

## License

Apache License 2.0.

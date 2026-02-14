# Cloak Mobile (React Native)

## Overview

Cross-platform mobile app (Android + iOS) for the Cloak privacy wallet. Uses a hidden WebView to run the Tongo SDK for ZK-proof-based shielded payments. Serves as the signing device for 2FA approval and ward guardian operations.

## Architecture

```
src/
├── App.tsx                     Root component with provider hierarchy
├── bridge/
│   ├── TongoBridge.tsx         Hidden WebView provider (Tongo SDK runtime)
│   ├── bridgeHtml.ts           Inline webpack bundle (~765KB)
│   ├── useTongoBridge.ts       Hook wrapping bridge commands
│   └── tongo-bridge.js         Browser-side bridge interface
├── lib/
│   ├── WalletContext.tsx        Wallet state, creation, deployment, balances, operations
│   ├── TwoFactorContext.tsx     2FA state, enable/disable, Supabase polling
│   ├── wardContext.tsx          Ward/guardian state, approval flows, ward creation
│   ├── twoFactor.ts            2FA utilities: DualKeySigner, biometrics, Supabase ops
│   ├── keys.ts                 AsyncStorage-based key management
│   ├── tokens.ts               Token display helpers (tongoToDisplay, erc20ToDisplay)
│   ├── storage.ts              Contacts + tx notes in AsyncStorage
│   ├── theme.ts                Design tokens (colors, spacing, fontSize, borderRadius)
│   └── haptics.ts              Vibration feedback (success, error, medium)
├── screens/
│   ├── HomeScreen.tsx           Portfolio, create/import wallet, ward import, claim
│   ├── SendScreen.tsx           3-step shielded transfer wizard
│   ├── WalletScreen.tsx         Shield/unshield + balances per token
│   ├── ActivityScreen.tsx       Transaction history
│   ├── SettingsScreen.tsx       2FA, contacts, wards, backup, config
│   ├── DeployScreen.tsx         Account deployment gate (QR, faucet, deploy)
│   └── POCScreen.tsx            Bridge health check (dev only)
├── components/
│   ├── Toast.tsx                Non-blocking notification system
│   ├── ErrorBoundary.tsx        Render error boundary with restart
│   ├── ThemedModal.tsx          Success/error/confirm modal system
│   ├── CloakIcon.tsx            Shield logo SVG
│   ├── ApprovalModal.tsx        2FA approval UI (biometric → dual-sign → submit)
│   ├── WardApprovalModal.tsx    Ward signing UI (ward primary + 2FA keys)
│   └── GuardianApprovalModal.tsx Guardian approval UI (guardian keys → submit)
├── hooks/
│   ├── useTransactionRouter.ts  Centralized tx dispatcher (ward → 2FA → direct)
│   ├── useDualSigExecutor.ts    2FA execution (biometric gate → DualKeySigner)
│   └── useContacts.ts           Contact management hook
├── navigation/
│   └── AppNavigator.tsx         Bottom tab navigator with deployment gate
└── styles/
    └── (inline via theme.ts)
```

## Provider Hierarchy

```
SafeAreaProvider
└── ToastProvider
    └── TongoBridgeProvider (hidden WebView)
        └── WalletProvider (keys, balance, deployment)
            └── TwoFactorProvider (2FA state, polling)
                └── WardProvider (guardian/ward state)
                    └── ErrorBoundary
                        ├── AppNavigator (5 bottom tabs)
                        ├── ApprovalModal (2FA requests)
                        ├── WardApprovalModal (ward signing)
                        └── GuardianApprovalModal (guardian signing)
```

## WebView Bridge

The Tongo SDK runs inside a hidden WebView because it requires browser APIs (Web Crypto, etc.) that React Native doesn't natively support.

```
React Native (useTongoBridge hook)
    → TongoBridge.send(command, params)
    → WebView.postMessage(JSON)
    → tongo-bridge.js handles command
    → @fatsolutions/tongo-sdk executes (ZK proofs, crypto)
    → WebView.postMessage(result)
    → TongoBridge resolves Promise
```

**Critical**: WebView `baseUrl` MUST be `https://localhost` (NOT `about:blank`). Web Crypto API requires a secure context.

**Timeout**: 60 seconds for ZK proof generation.

### Bridge Commands

`initialize()`, `getState()`, `getRate()`, `getTongoAddress()`, `fund()`, `transfer()`, `withdraw()`, `rollover()`, `prepareFund()`, `prepareTransfer()`, `prepareWithdraw()`, `prepareRollover()`, `switchToken()`, `generateKeypair()`, `derivePublicKey()`, `queryERC20Balance()`, `getTxHistory()`, `validateBase58()`

## Context Providers

### WalletContext
- Wallet creation/import (Stark keypairs via bridge)
- Account deployment on-chain
- Token selection (STRK/ETH/USDC)
- Balance refresh (shielded + ERC-20)
- Transaction execution (fund, transfer, withdraw, rollover)
- Prepare methods (return Call[] for advanced signing)
- Auto-initializes from AsyncStorage on mount

### TwoFactorContext
- Secondary key generation + AsyncStorage persistence
- On-chain registration (`set_secondary_key` call)
- Supabase polling (3s interval) for pending approval requests
- Enable/disable flow with biometric gates
- AppState listener (re-polls on app foreground)
- Dynamic gas estimation for ward + CloakAccount+2FA

### WardContext
- Ward detection (on-chain `get_account_type()`)
- Guardian's ward list (Supabase `ward_configs`)
- Ward creation (deploy CloakWard via UDC, fund with STRK, register in Supabase)
- Ward signing (`approveAsWard` — estimate gas, sign, submit or forward to guardian)
- Guardian signing (`approveAsGuardian` — sign, assemble full sig chain, submit)
- `waitForTransaction()` + revert check on all submissions
- Polling for `pending_ward_sig` and `pending_guardian` requests

## Transaction Router (`hooks/useTransactionRouter.ts`)

Central dispatcher that routes all transactions:

```
1. Ward account? → ward.initiateWardTransaction() (Supabase pipeline)
2. 2FA enabled? → useDualSigExecutor().executeDualSig() (biometric + dual-sig)
3. Default → direct SDK calls via bridge
```

## Key Management (`lib/keys.ts`)

Keys stored in AsyncStorage (TODO: migrate to Keychain/Keystore for production):

```typescript
WalletKeys = {
  starkPrivateKey, starkAddress, starkPublicKey,
  tongoPrivateKey, tongoAddress
}
```

Functions: `hasWallet()`, `saveWalletKeys()`, `loadWalletKeys()`, `clearWallet()`

## 2FA Utilities (`lib/twoFactor.ts`)

### Signers
- **DualKeySigner**: Extends starknet.js `Signer`, overrides `signRaw()` → `[r1, s1, r2, s2]`
- **DualSignSigner**: Pre-computed sig wrapper for edge cases

### Biometrics
- `isBiometricsAvailable()` — device capability check
- `promptBiometric(message)` — show biometric prompt (auto-approves on simulator)

### Secondary Key
- `generateSecondaryKey()`, `saveSecondaryPrivateKey()`, `getSecondaryPrivateKey()`, `clearSecondaryKey()`, `getSecondaryPublicKey()`

### Supabase Operations
- `getSupabaseLite()`, `fetchPendingRequests()`, `updateRequestStatus()`, `enableTwoFactorConfig()`, `disableTwoFactorConfig()`, `isTwoFactorConfigured()`

## Navigation

Bottom tab navigator with 5 tabs:
1. **Home** — Portfolio, create/import, claim
2. **Send** — 3-step shielded transfer
3. **Wallet** — Shield/unshield
4. **Activity** — Transaction history
5. **Settings** — 2FA, contacts, wards, backup

**Deployment gate**: If wallet exists but not deployed → shows DeployScreen instead of tabs.

## Build & Deploy

### Android
```bash
cd packages/mobile/android
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
ANDROID_HOME=~/Library/Android/sdk \
./gradlew assembleDebug

# Install
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Metro (separate terminal)
cd packages/mobile && npx react-native start --port 8081
adb reverse tcp:8081 tcp:8081
```

### iOS
```bash
cd packages/mobile
npx react-native run-ios --simulator="iPhone 17 Pro"
```

**Package name**: `com.cloakmobile` (Android), `org.reactjs.native.example.CloakMobile` (iOS)

## Metro Config

- `watchFolders`: monorepo root (for SDK changes)
- `blockList`: excludes nextjs, extension, snfoundry packages
- `nodeModulesPaths`: resolves from both local + root node_modules
- `resolveRequest`: fallback .js → .ts resolution

## Design System (`lib/theme.ts`)

```typescript
colors.bg = "#0F172A"        // Dark background
colors.surface = "#1E293B"   // Card surface
colors.primary = "#3B82F6"   // Blue primary
colors.success = "#10B981"   // Green
colors.error = "#EF4444"     // Red
colors.text = "#F8FAFC"      // White text
colors.textSecondary = "#94A3B8"
```

Spacing: xs(4), sm(8), md(16), lg(24), xl(32), xxl(48)
Font sizes: xs(11), sm(13), md(15), lg(18), xl(24), xxl(32), hero(40)

## LogBox Suppressions

```
[TongoBridge], [WalletContext], [ErrorBoundary], [TwoFactorContext],
[twoFactor], [ApprovalModal], [WardContext], [WardApprovalModal], [GuardianApprovalModal]
```

## Critical Notes

1. **WebView `baseUrl`**: MUST be `https://localhost`. `about:blank` breaks Web Crypto.
2. **DualKeySigner**: Must sign with both keys. CloakAccount `__validate__` expects `[r1,s1,r2,s2]`.
3. **`tip: 0`**: Required when using pre-computed signatures. Hash mismatch otherwise.
4. **Dynamic gas estimation**: `estimateInvokeFee` fails on CloakWard and CloakAccount+2FA. Use `estimateWardInvokeFee()` with SKIP_VALIDATE.
5. **Biometrics on simulator**: Auto-approves. Real devices show actual biometric prompt.
6. **AsyncStorage is unencrypted**: Production must use Keychain (iOS) / Keystore (Android).
7. **starknet.js v8**: Object-pattern Account constructor: `new Account({provider, address, signer})`.
8. **Bridge `send()` not exposed**: `useTongoBridge` wraps commands into named methods. Add new method to hook for new bridge commands.
9. **Address inputs**: Set `spellCheck={false}` and `autoComplete="off"`. Use `multiline` + paste button for base58.
10. **iOS padding**: Platform-specific — iOS Dynamic Island creates top spacing.
11. **`getTxHistory()` fails**: WebView limitation. Will be replaced with Supabase reads.
12. **Metro blocklist**: Prevents crawling nextjs/extension packages (large bundle prevention).

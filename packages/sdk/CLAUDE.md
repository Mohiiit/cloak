# @cloak-wallet/sdk

## Overview

The core TypeScript library that all three Cloak frontends (web, extension, mobile) depend on. Provides wallet management, shielded payment operations, 2FA approval flows, ward/guardian utilities, and centralized configuration. Built with tsup for dual CJS/ESM output.

## Architecture

```
src/
├── index.ts          42 public exports (barrel file)
├── config.ts         Centralized constants (RPC, class hashes, Supabase)
├── client.ts         CloakClient class (wallet lifecycle)
├── account.ts        CloakAccount class (per-token shielded operations)
├── wallet.ts         Address computation, deploy payloads
├── keys.ts           Key generation and validation
├── address.ts        Address padding, truncation, validation
├── tokens.ts         STRK/ETH/USDC configs with rates
├── types.ts          TypeScript interfaces
├── errors.ts         Custom error classes with codes
├── two-factor.ts     2FA signing, approval polling
├── ward.ts           Ward/guardian on-chain reads, fee estimation, signing
├── supabase.ts       SupabaseLite (lightweight PostgREST client)
└── storage/
    ├── index.ts      Barrel export
    ├── memory.ts     MemoryStorage (Map-based, for tests)
    └── localStorage.ts  LocalStorageAdapter (browser, with prefix)
```

## Key Classes

### CloakClient

Main entry point for wallet operations.

```typescript
const client = new CloakClient({ network: "sepolia", storage: new LocalStorageAdapter() });
const wallet = await client.createWallet();
await client.init();
await client.deployAccount();       // Deploy OZ account
await client.deployMultiSigAccount(); // Deploy CloakAccount (2FA-capable)
const acct = client.account("STRK"); // Get per-token CloakAccount
```

**Methods**: `createWallet()`, `importWallet(pk)`, `getWallet()`, `hasWallet()`, `clearWallet()`, `init()`, `deployAccount()`, `deployMultiSigAccount()`, `isDeployed()`, `setSecondaryKey(pubKey)`, `removeSecondaryKey()`, `is2FAEnabled()`, `account(token)`, `getTongoAddress()`

### CloakAccount

Per-token shielded operations. One instance per token (STRK, ETH, USDC).

```typescript
const acct = client.account("STRK");
await acct.fund(1n);                          // Shield 1 unit = 0.05 STRK
await acct.transfer(recipientBase58, 1n);     // Private transfer
await acct.withdraw(1n);                      // Unshield
await acct.rollover();                        // Claim pending
const state = await acct.getState();          // { balance, pending, nonce }
```

**Execute methods**: `fund()`, `transfer()`, `withdraw()`, `rollover()`
**Prepare methods** (return Call[] without executing): `prepareFund()`, `prepareTransfer()`, `prepareWithdraw()`, `prepareRollover()`
**2FA methods**: `prepareAndSign(calls)` (sign with key 1), `executeWithDualSignature(calls, sig1, sig2, nonce, rb)` (submit dual sig)

### SupabaseLite

Lightweight PostgREST client (no heavy Supabase SDK dependency).

```typescript
const sb = new SupabaseLite(url, anonKey);
await sb.insert("table", { col: "value" });
const rows = await sb.select("table", "col=eq.value");
await sb.update("table", "id=eq.123", { status: "done" });
await sb.delete("table", "id=eq.123");
```

**Filter format**: PostgREST query strings like `"wallet_address=eq.0x123&status=eq.pending"`

## Configuration (`config.ts`)

Single source of truth for all shared constants:

```typescript
DEFAULT_RPC.sepolia    // Alchemy Sepolia RPC
DEFAULT_RPC.mainnet    // Blast mainnet RPC
CLOAK_WARD_CLASS_HASH  // CloakWard class hash on Sepolia
STRK_ADDRESS           // STRK ERC-20 address
DEFAULT_SUPABASE_URL   // Supabase project URL
DEFAULT_SUPABASE_KEY   // Supabase anon key
```

## Token System (`tokens.ts`)

```typescript
TOKENS.STRK.rate  // 50000000000000000n (1 unit = 0.05 STRK)
TOKENS.ETH.rate   // 3000000000000n     (1 unit = 0.000003 ETH)
TOKENS.USDC.rate  // 10000n             (1 unit = 0.01 USDC)

formatTokenAmount(50000000000000000n, 18)  // "0.05"
parseTokenAmount("0.05", 18)               // 50000000000000000n
```

## 2FA System (`two-factor.ts`)

**Signing**: `signTransactionHash(txHash, privateKey)` → `[r, s]`
**Combining**: `combinedSignature(sig1, sig2)` → `[r1, s1, r2, s2]`
**Approval flow**: `request2FAApproval(sb, params, onStatusChange?, signal?)` — inserts to Supabase, polls every 2s for 5min

## Ward System (`ward.ts`)

### On-Chain Reads
- `checkIfWardAccount(provider, address)` — checks `get_account_type()` == "WARD"
- `fetchWardApprovalNeeds(provider, wardAddress)` — guardian address + 2FA flags
- `fetchWardInfo(provider, address)` — full ward config (guardian, frozen, limits)

### Fee Estimation (CRITICAL)
- `estimateWardInvokeFee(provider, senderAddress, calls)` — uses `starknet_estimateFee` RPC with `SKIP_VALIDATE` flag and dummy signature `["0x0"]`
- `buildResourceBoundsFromEstimate(estimate, safetyMultiplier?)` — converts estimate to resource bounds with 1.5x safety margin
- Standard `estimateInvokeFee()` FAILS on CloakWard and CloakAccount+2FA

### Signing
- `signHash(txHash, privateKey)` → `[r, s]`
- `assembleWardSignature(request, guardianSig?, guardian2faSig?)` — builds full signature chain

### Ward Approval Flow
- `requestWardApproval(sb, params, onStatusChange?, signal?)` — inserts to `ward_approval_requests`, polls every 2s for 10min

### Amount Formatting
- `formatWardAmount(tongoUnits, tokenKey, action)` — "0.5 STRK" or "Claim pending balance"

## Error Classes (`errors.ts`)

| Class | Code | When |
|-------|------|------|
| `CloakError` | Custom | Base error |
| `WalletNotFoundError` | `WALLET_NOT_FOUND` | No wallet in storage |
| `InvalidKeyError` | `INVALID_KEY` | Bad private key |
| `AccountNotDeployedError` | `ACCOUNT_NOT_DEPLOYED` | Account not on-chain |
| `InsufficientBalanceError` | `INSUFFICIENT_BALANCE` | Not enough funds |
| `TransactionFailedError` | `TX_FAILED` | On-chain revert |

## Storage Adapters

```typescript
// Browser
const storage = new LocalStorageAdapter("cloak_");

// Testing / Server
const storage = new MemoryStorage();

// Interface
interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
```

## Build

```bash
npm run build    # tsup → dist/index.js (CJS) + dist/index.mjs (ESM) + dist/index.d.ts
npm test         # vitest (28 unit tests)
npm run lint     # TypeScript check
```

**Output**: `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts` with source maps and declaration maps.

**Externals**: `starknet` and `@fatsolutions/tongo-sdk` are NOT bundled — consumers install as peer dependencies.

## Testing

### Unit Tests (`tests/`)
- `keys.test.ts` — key generation, validation, uniqueness
- `tokens.test.ts` — token config, formatting, parsing, round-trips
- `account.test.ts` — wallet CRUD, CloakAccount state, prepare methods

### E2E Tests (Node.js scripts)
- `e2e-test.cjs` — Full CloakAccount lifecycle (9 steps: deploy, 2FA enable, dual-sig, disable)
- `test-ward-setup.cjs` — Deploy CloakWard contract
- `test-ward-approval.cjs` — Ward approval pipeline

All E2E scripts read from `.env` (see `.env.example`).

## Critical Implementation Notes

1. **`tip: 0` for pre-computed sigs**: When using `DualSignSigner` or `executeWithDualSignature()`, MUST pass `tip: 0` to `account.execute()`. starknet.js auto-estimates tip causing hash mismatch.

2. **Address padding**: Tongo ZK proofs require 66-char padded addresses (0x + 64 hex). Use `padAddress()`.

3. **SupabaseLite filters**: String-based PostgREST format (`"key=eq.value"`), NOT Record objects. Throws on error (no `{data, error}` pattern).

4. **BigInt serialization**: Use `JSON.stringify(obj, (_k, v) => typeof v === "bigint" ? "0x" + v.toString(16) : v)` for Supabase storage, `BigInt(val)` on deserialize.

5. **Tongo address**: Base58 format, derived from private key + token contract address. Required for shielded transfers.

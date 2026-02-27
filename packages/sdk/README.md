# @cloak-wallet/sdk

Privacy-preserving wallet SDK for Starknet, built on the [Tongo](https://tongo.money) shielded pool protocol.

Cloak lets you shield tokens into a private balance, transfer them anonymously, and withdraw back to public — all on Starknet L2 with ZK proofs under the hood.

## Companion Links

- Marketplace UI (hosted): https://cloak-backend-vert.vercel.app/marketplace
- Marketplace API base (hosted): https://cloak-backend-vert.vercel.app/api/v1/marketplace
- Monorepo root docs: [../../README.md](../../README.md)

## Install

```bash
npm install @cloak-wallet/sdk
```

Latest stable release: `0.2.2`

> Recommended: use `@cloak-wallet/sdk@0.2.2` or newer. Version `0.2.0` is deprecated.

The package currently ships with `starknet@8.5.3` as a direct dependency.

## Quick Start

```typescript
import { CloakClient, LocalStorageAdapter } from "@cloak-wallet/sdk";

// 1. Initialize the client
const client = new CloakClient({
  network: "sepolia",
  storage: new LocalStorageAdapter(),
});

// 2. Create a wallet (or import an existing one)
const wallet = await client.createWallet();
console.log("Address:", wallet.starkAddress);
console.log("Tongo address:", wallet.tongoAddress);

// 3. Initialize for use (loads keys from storage)
await client.init();

// 4. Deploy the account on-chain (requires ETH/STRK for gas)
const deployTx = await client.deployAccount();

// 5. Shield tokens (move from public → private balance)
const strk = client.account("STRK");
const { txHash } = await strk.fund(1n); // 1 Tongo unit = 0.05 STRK

// 6. Check private balance
const state = await strk.getState();
console.log("Shielded balance:", strk.formatAmount(state.balance));
console.log("Pending:", strk.formatAmount(state.pending));

// 7. Transfer privately
await strk.transfer("base58RecipientTongoAddress", 1n);

// 8. Claim pending funds
await strk.rollover();

// 9. Withdraw (move from private → public balance)
await strk.withdraw(1n);
```

## Core Concepts

**Shielded pool**: Tokens are deposited into a Tongo contract that hides sender, receiver, and amounts using ZK proofs. Only the private key holder can see their balance.

**Tongo units**: Each token has a fixed `rate` that converts between ERC-20 amounts and Tongo units. For STRK, 1 Tongo unit = 0.05 STRK (rate = 5×10¹⁶ wei).

**Four operations**:
| Operation | Description |
|-----------|-------------|
| `fund` (Shield) | Deposit ERC-20 tokens into the shielded pool |
| `transfer` | Send shielded tokens to another Tongo address |
| `rollover` (Claim) | Move pending funds into available balance |
| `withdraw` (Unshield) | Withdraw from shielded pool back to public wallet |

**Account types**:
- **Standard** — OpenZeppelin account, single-key signing
- **CloakAccount** — Multi-sig capable account with optional 2FA (secondary key)
- **CloakWard** — Guardian-controlled account where transactions require guardian co-signing

## Agentic Marketplace + x402 Flow (Current)

The current model has two layers:

- Marketplace layer (`agent -> hire -> run`)
- Payment layer (x402 challenge/verify/settle for billable runs)

Key behavior:

- `hire` is a long-lived policy agreement. It does not move money.
- `run` is one execution attempt.
- For `billable: true`, payment is required before execution.

### End-to-end lifecycle

1. Register agent profile with `agent_id`, `agent_type`, `capabilities`, `endpoints`, pricing, and wallets.
2. Create one or more hires with policy JSON (`policy_snapshot`) and `billing_mode`.
3. Create a run (`POST /api/v1/marketplace/runs`).
4. If run is billable and unpaid, backend returns `402` plus `x-x402-challenge`.
5. Client executes shielded payment on-chain (current pattern: Tongo withdraw to challenge recipient) and builds x402 payment payload.
6. Client retries the same run request with `x-x402-challenge` and `x-x402-payment` headers.
7. Backend verifies challenge/payload integrity, replay protection, and proof binding.
8. Backend settles payment, stores evidence (`payment_ref`, `settlement_tx_hash`, payment state), then runs agent execution.
9. Run transitions through `pending_payment -> queued -> running -> completed|failed` (or remains pending if settlement is still in flight).

### Money flow for paid runs

- Payer: the caller's shielded wallet (`tongoAddress` in x402 payload).
- Recipient: challenge recipient, usually the agent `service_wallet`.
- Evidence attached to run: `payment_ref`, `settlement_tx_hash`, and `payment_evidence.state`.
- Current billing semantics: per-run attempt. A failed execution still records paid evidence for that run attempt.

## Build Your Own Agents (SDK Contract)

The SDK exposes the same contract used by Cloak first-party agents. Third parties can register and operate with identical schemas.

### 1. Session bootstrap

```typescript
import { createMarketplaceSession } from "@cloak-wallet/sdk";

const session = createMarketplaceSession({
  baseUrl: "https://your-cloak-backend.example.com",
  apiKey: process.env.CLOAK_API_KEY!,
});
```

### 2. Agent profile schema (`RegisterAgentRequest`)

- `agent_id`: stable unique id for your runtime.
- `name`, `description`, `image_url?`.
- `agent_type`: `staking_steward | treasury_dispatcher | swap_runner`.
- `capabilities`: discoverability tags (for filtering/ranking).
- `endpoints`: execution endpoints you control.
- `endpoint_proofs?`: ownership digests for endpoints.
- `pricing`: `{ mode: "per_run" | "subscription" | "success_fee", amount, token, cadence? }`.
- `operator_wallet`: operator identity wallet.
- `service_wallet`: payment recipient wallet for x402 settlements.
- Optional profile metadata: `metadata_uri`, `trust_score`, `verified`, `status`.

### 3. Hire schema (`CreateAgentHireRequest`)

- `agent_id`
- `operator_wallet`
- `policy_snapshot: Record<string, unknown>`
- `billing_mode`

Recommended policy keys:

- `allowed_actions`
- `max_usd_per_run`
- `max_token_amounts`
- `max_runs_per_day`

### 4. Run schema (`CreateAgentRunRequest`)

- `hire_id`
- `action`
- `params`
- `billable`

Note: the backend can infer `agent_id` from `hire_id`, but `MarketplaceClient#createRun` currently accepts `agent_id` as part of its input shape for compatibility with direct run creation workflows.

### 5. Action and params contract

| Agent Type | Action | Required `params` keys |
|-----------|--------|-------------------------|
| `staking_steward` | `stake` | `amount` (string) |
| `staking_steward` | `unstake` | `amount` (string) |
| `staking_steward` | `rebalance` | `from_pool` (string), `to_pool` (string) |
| `treasury_dispatcher` | `dispatch_batch` | `transfers` (non-empty array) |
| `treasury_dispatcher` | `sweep_idle` | `target_vault` (string) |
| `swap_runner` | `swap` | `from_token` (string), `to_token` (string), `amount` (string) |
| `swap_runner` | `dca_tick` | `strategy_id` (string) |

If `action` is invalid for the agent type, backend rejects the run.

Basic runtime override:
- For any supported action, you can send `params.calls` (non-empty array of Starknet call objects) to execute explicit on-chain calls directly.
- When `params.calls` is present, action-specific param requirements are bypassed.

### 6. SDK example: register + hire + run

```typescript
import {
  createMarketplaceSession,
  createEndpointOwnershipProof,
} from "@cloak-wallet/sdk";

const session = createMarketplaceSession({
  baseUrl: "https://your-cloak-backend.example.com",
  apiKey: process.env.CLOAK_API_KEY!,
});

const operatorWallet = "0xoperator";
const serviceWallet = "0xservice";

const agent = await session.marketplace.registerAgent({
  agent_id: "my_swap_runner_v1",
  name: "My Swap Runner",
  description: "Executes policy-scoped swaps",
  agent_type: "swap_runner",
  capabilities: ["swap", "x402_shielded"],
  endpoints: ["https://agent.example.com/execute"],
  endpoint_proofs: [
    createEndpointOwnershipProof({
      endpoint: "https://agent.example.com/execute",
      operatorWallet,
      nonce: "nonce-1",
    }),
  ],
  pricing: {
    mode: "per_run",
    amount: "25",
    token: "STRK",
  },
  operator_wallet: operatorWallet,
  service_wallet: serviceWallet,
});

const hire = await session.marketplace.createHire({
  agent_id: agent.agent_id,
  operator_wallet: operatorWallet,
  policy_snapshot: {
    max_usd_per_run: 25,
    allowed_actions: ["swap"],
  },
  billing_mode: "per_run",
});

const run = await session.marketplace.createRun({
  hire_id: hire.id,
  agent_id: agent.agent_id,
  action: "swap",
  params: { from_token: "USDC", to_token: "STRK", amount: "25" },
  billable: true,
});
```

### 7. SDK example: automatic 402 retry with proof provider

```typescript
import {
  x402FetchWithProofProvider,
  TongoEnvelopeProofProvider,
  createX402TongoProofEnvelope,
} from "@cloak-wallet/sdk";

const response = await x402FetchWithProofProvider(
  "https://your-cloak-backend.example.com/api/v1/marketplace/runs",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.CLOAK_API_KEY!,
    },
    body: JSON.stringify({
      hire_id: "hire_123",
      agent_id: "my_swap_runner_v1",
      action: "swap",
      params: { from_token: "USDC", to_token: "STRK", amount: "25" },
      billable: true,
    }),
  },
  {
    tongoAddress: "your-tongo-address",
    proofProvider: new TongoEnvelopeProofProvider(async input => {
      // Execute real on-chain payment and return the tx hash.
      const settlementTxHash = "0x...";
      // Optional: include prover bundle if your runtime has it.
      const tongoProof = undefined;

      return createX402TongoProofEnvelope({
        challenge: input.challenge,
        tongoAddress: input.tongoAddress,
        amount: input.amount,
        replayKey: input.replayKey,
        nonce: input.nonce,
        settlementTxHash,
        tongoProof,
        attestor: "my-agent-client",
      });
    }),
  },
);
```

## API Reference

### CloakClient

The main entry point. Manages wallet lifecycle, account deployment, and per-token access.

```typescript
const client = new CloakClient({
  network: "sepolia" | "mainnet",
  rpcUrl?: string,           // Custom RPC endpoint (defaults provided)
  storage?: StorageAdapter,  // Key storage backend
});
```

#### Wallet Management

```typescript
// Create a new wallet (generates keypair)
await client.createWallet(): Promise<WalletInfo>

// Import existing wallet by private key
await client.importWallet(privateKey: string, address?: string): Promise<WalletInfo>

// Check if a wallet exists in storage
await client.hasWallet(): Promise<boolean>

// Get current wallet info
await client.getWallet(): Promise<WalletInfo | null>

// Remove wallet from storage
await client.clearWallet(): Promise<void>

// Initialize client for use (call after create/import or at startup)
await client.init(): Promise<boolean>
```

#### Account Deployment

```typescript
// Deploy standard OpenZeppelin account
await client.deployAccount(): Promise<string> // returns tx hash

// Deploy CloakAccount (multi-sig capable, supports 2FA)
await client.deployMultiSigAccount(): Promise<string>

// Check if account is deployed on-chain
await client.isDeployed(): Promise<boolean>
```

#### 2FA (Two-Factor Authentication)

```typescript
// Enable 2FA by setting a secondary public key
await client.setSecondaryKey(pubKey: string): Promise<string>

// Disable 2FA
await client.removeSecondaryKey(): Promise<string>

// Check if 2FA is enabled on-chain
await client.is2FAEnabled(): Promise<boolean>

// Read the secondary public key from contract
await client.getSecondaryKey(): Promise<string>
```

#### Per-Token Access

```typescript
// Get a CloakAccount for a specific token
const account = client.account("STRK" | "ETH" | "USDC");
```

#### Static Utilities

```typescript
CloakClient.generateKey()                    // Generate a random private key
CloakClient.isValidKey(key)                  // Validate a private key
CloakClient.computeAddress(publicKey)        // Compute OZ account address
CloakClient.computeMultiSigAddress(publicKey) // Compute CloakAccount address
```

### CloakAccount

Per-token account for shielded pool operations. Obtained via `client.account("STRK")`.

#### Read State

```typescript
// Get shielded balance, pending, and nonce
await account.getState(): Promise<ShieldedState>

// Get public ERC-20 balance
await account.getErc20Balance(): Promise<bigint>

// Get the Tongo unit rate for this token
await account.getRate(): Promise<bigint>

// Get transaction history
await account.getTxHistory(fromBlock?: number): Promise<any[]>
```

#### Execute Operations

```typescript
// Shield tokens (ERC-20 → shielded pool)
await account.fund(amount: bigint): Promise<{ txHash: string }>

// Private transfer to a Tongo address
await account.transfer(to: string, amount: bigint): Promise<{ txHash: string }>

// Withdraw from shielded pool → public wallet
await account.withdraw(amount: bigint): Promise<{ txHash: string }>

// Claim pending funds into available balance
await account.rollover(): Promise<{ txHash: string }>
```

#### Prepare Operations (for 2FA / ward signing)

Returns `Call[]` without executing — used when an external signer needs to co-sign.

```typescript
await account.prepareFund(amount: bigint): Promise<{ calls: Call[] }>
await account.prepareTransfer(to: string, amount: bigint): Promise<{ calls: Call[] }>
await account.prepareWithdraw(amount: bigint): Promise<{ calls: Call[] }>
await account.prepareRollover(): Promise<{ calls: Call[] }>
```

#### Dual-Signature (2FA)

```typescript
// Sign calls with key 1 (returns partial sig for mobile co-signing)
await account.prepareAndSign(calls: Call[]): Promise<{
  calls: Call[];
  txHash: string;
  sig1: [string, string];
  nonce: string;
  resourceBoundsJson: string;
}>

// Submit with combined dual signature [r1, s1, r2, s2]
await account.executeWithDualSignature(
  calls, sig1, sig2, nonce, resourceBoundsJson
): Promise<{ txHash: string }>
```

#### Amount Conversions

```typescript
// ERC-20 wei → Tongo units
await account.erc20ToTongo(erc20Amount: bigint): Promise<bigint>

// Tongo units → ERC-20 wei
await account.tongoToErc20(tongoAmount: bigint): Promise<bigint>

// Tongo units → display string (e.g. "0.05")
account.formatAmount(tongoUnits: bigint): string

// Display string → Tongo units
account.parseAmount(displayAmount: string): bigint
```

### Ward System

The ward system enables guardian-controlled accounts. A ward account requires its guardian to co-sign all transactions.

```typescript
import {
  checkIfWardAccount,
  fetchWardApprovalNeeds,
  fetchWardInfo,
  requestWardApproval,
  signHash,
  assembleWardSignature,
  getBlockGasPrices,
  buildWardResourceBounds,
  serializeResourceBounds,
  deserializeResourceBounds,
  SupabaseLite,
} from "@cloak-wallet/sdk";
```

#### On-Chain Reads

```typescript
// Check if an address is a CloakWard
await checkIfWardAccount(provider, address): Promise<boolean>

// Get approval requirements (guardian address, 2FA flags)
await fetchWardApprovalNeeds(provider, wardAddress): Promise<WardApprovalNeeds | null>

// Get full ward info (guardian, 2FA, frozen, limits)
await fetchWardInfo(provider, address): Promise<WardInfo | null>
```

#### Signing

```typescript
// Sign a tx hash with a Stark private key → [r, s]
signHash(txHash: string, privateKey: string): [string, string]

// Assemble full signature chain for ward submission
assembleWardSignature(request, guardianSig?, guardian2faSig?): string[]
```

#### Gas Prices

```typescript
// Fetch current gas prices with 3x safety margin
await getBlockGasPrices(provider): Promise<BlockGasPrices>

// Build resource bounds for ward invoke v3
buildWardResourceBounds(gasPrices): ResourceBounds

// Serialize BigInt resource bounds for JSON storage
serializeResourceBounds(resourceBounds): string

// Deserialize back to BigInt
deserializeResourceBounds(json): ResourceBounds
```

#### Ward Approval Flow

```typescript
const sb = new SupabaseLite(SUPABASE_URL, SUPABASE_ANON_KEY);

const result = await requestWardApproval(sb, {
  wardAddress: "0x...",
  guardianAddress: "0x...",
  action: "fund",
  token: "STRK",
  amount: "1",
  recipient: null,
  callsJson: JSON.stringify(calls),
  wardSigJson: JSON.stringify(sig),
  nonce: "5",
  resourceBoundsJson: serializeResourceBounds(rb),
  txHash: "0x...",
  needsWard2fa: false,
  needsGuardian: true,
  needsGuardian2fa: false,
}, (status) => console.log(status));

if (result.approved) {
  console.log("Tx hash:", result.txHash);
}
```

### SupabaseLite

Lightweight Supabase PostgREST client — no heavy SDK dependency, just fetch-based REST calls.

```typescript
const sb = new SupabaseLite(url, anonKey);

await sb.insert("table", { col: "value" });
await sb.select("table", "col=eq.value", "created_at.desc");
await sb.update("table", "id=eq.123", { status: "done" });
await sb.delete("table", "id=eq.123");

// Polling (returns cleanup function)
const stop = sb.poll("table", "status=eq.pending", 2000, (rows) => {
  console.log("New rows:", rows);
});
stop(); // Stop polling
```

### Storage Adapters

The SDK uses a `StorageAdapter` interface for key persistence:

```typescript
interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
```

Built-in adapters:

| Adapter | Use Case |
|---------|----------|
| `MemoryStorage` | Testing, server-side, ephemeral |
| `LocalStorageAdapter` | Browser `localStorage` with configurable prefix |

Custom adapter example (React Native AsyncStorage):

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";

const storage: StorageAdapter = {
  get: (key) => AsyncStorage.getItem(`cloak_${key}`),
  set: (key, val) => AsyncStorage.setItem(`cloak_${key}`, val),
  remove: (key) => AsyncStorage.removeItem(`cloak_${key}`),
};

const client = new CloakClient({ network: "sepolia", storage });
```

### Address Utilities

```typescript
import {
  padAddress,
  truncateAddress,
  truncateTongoAddress,
  validateTongoAddress,
} from "@cloak-wallet/sdk";

padAddress("0x3e8")           // "0x00000000000000000000000000000000000000000000000000000000000003e8"
truncateAddress("0x1234abcd") // "0x1234...abcd"
validateTongoAddress("base58...") // true/false
```

### Token Configuration

```typescript
import { TOKENS, formatTokenAmount, parseTokenAmount } from "@cloak-wallet/sdk";

TOKENS.STRK.rate     // 50000000000000000n (1 unit = 0.05 STRK)
TOKENS.ETH.rate      // 3000000000000n (1 unit = 0.000003 ETH)
TOKENS.USDC.rate     // 10000n (1 unit = 0.01 USDC)

formatTokenAmount(50000000000000000n, 18) // "0.05"
parseTokenAmount("0.05", 18)              // 50000000000000000n
```

### 2FA Utilities

```typescript
import { signTransactionHash, combinedSignature, serializeCalls, deserializeCalls } from "@cloak-wallet/sdk";

// Sign a tx hash
const sig = signTransactionHash(txHash, privateKey); // [r, s]

// Combine two sigs for CloakAccount dual-signing
const combined = combinedSignature(sig1, sig2); // [r1, s1, r2, s2]

// Serialize/deserialize Call[] for Supabase storage
const json = serializeCalls(calls);
const restored = deserializeCalls(json);
```

### Error Classes

All errors extend `CloakError` with a `code` property:

| Error | Code | When |
|-------|------|------|
| `WalletNotFoundError` | `WALLET_NOT_FOUND` | No wallet in storage |
| `InvalidKeyError` | `INVALID_KEY` | Private key fails validation |
| `AccountNotDeployedError` | `ACCOUNT_NOT_DEPLOYED` | Account not on-chain |
| `InsufficientBalanceError` | `INSUFFICIENT_BALANCE` | Not enough funds |
| `TransactionFailedError` | `TX_FAILED` | On-chain tx reverted |

```typescript
import { CloakError, WalletNotFoundError } from "@cloak-wallet/sdk";

try {
  await client.deployAccount();
} catch (e) {
  if (e instanceof CloakError) {
    console.error(e.code, e.message);
  }
}
```

## Supported Tokens (Sepolia)

| Token | Tongo Rate | 1 Unit = |
|-------|-----------|----------|
| STRK | 5×10¹⁶ | 0.05 STRK |
| ETH | 3×10¹² | 0.000003 ETH |
| USDC | 10⁴ | 0.01 USDC |

## Security Considerations

### Private keys

- Private keys are signed locally and should never be sent to a backend.
- Use platform-secure storage adapters in production.
- `LocalStorageAdapter` is convenient for development; prefer hardened storage in production apps.

### API keys and server-side modules

- API keys used by backend or voice integrations should not be embedded in public client bundles.
- Proxy sensitive operations via your backend where possible.

### RPC endpoints

- Default public RPCs can be rate-limited.
- Use dedicated provider endpoints for production traffic.

## Architecture

```
@cloak-wallet/sdk
├── CloakClient          # Wallet lifecycle, deployment, 2FA management
├── CloakAccount         # Per-token shielded operations (fund/transfer/withdraw/rollover)
├── SupabaseLite         # Lightweight PostgREST client for approval flows
├── Ward module          # Guardian-controlled account logic
├── Storage adapters     # Pluggable key persistence (Memory, LocalStorage, custom)
└── Utilities            # Keys, addresses, tokens, errors, 2FA signing
```

The SDK wraps the [Tongo SDK](https://www.npmjs.com/package/@fatsolutions/tongo-sdk) for ZK proof generation and uses [starknet.js v8](https://www.starknetjs.com/) for on-chain interactions.

## License

Apache-2.0

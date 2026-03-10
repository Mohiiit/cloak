# Cloak — Full Project Detail

## What Is Cloak?

Cloak is a **privacy-native wallet and AI agent marketplace for Starknet**. It lets users shield tokens into encrypted on-chain balances, transact privately using ZK proofs, and delegate spending power to autonomous AI agents — all without surrendering custody of their keys.

It started as a privacy wallet ("Venmo, but amounts are cryptographic"). It has evolved into a full agentic stack: an on-chain identity registry, trustless delegation contracts, a marketplace of verifiable AI agents, and a payment protocol (x402) where every agent run is settled privately on-chain.

---

## The Problem

Starknet (and EVM broadly) exposes every transaction. Your wallet address, the amount, the counterparty — everything is public. Privacy is treated as an optional feature, bolted on after the fact. This creates a fundamental tension: you either transact publicly and lose financial privacy, or you use a mixer and lose legitimacy.

For AI agents, the problem is worse. Existing approaches either:
- Give the agent a private key (full custodial risk)
- Use off-chain payment rails (no on-chain auditability)
- Have no spending caps (unlimited damage if compromised)

Cloak solves both problems from the ground up.

---

## Core Features

### 1. Shielded Payments (ZK)

Every Cloak account has a shielded balance powered by the **Tongo protocol** — ElGamal encryption + ZK proofs on Starknet.

| Operation | What it does |
|-----------|--------------|
| **Shield** | Deposit STRK/ETH/USDC into the encrypted pool |
| **Send** | Transfer to another Cloak address — amount hidden on-chain |
| **Claim** | Roll pending incoming transfers into your spendable balance |
| **Unshield** | Withdraw back to public wallet with a ZK proof |

The social layer is preserved: transaction notes, who paid whom, and activity history are visible — only amounts are cryptographically hidden. This is the Venmo model made cryptographic rather than just a UI toggle.

**Cryptography**: ElGamal encryption over StarkCurve. ZK proofs generated via the Tongo SDK (WASM in a WebView on mobile, native WASM on web/extension). Verification happens on-chain.

**Tokens supported**: STRK, ETH, USDC (each has its own Tongo contract with a fixed rate — 1 Tongo unit = 0.05 STRK / 0.000003 ETH / 0.01 USDC).

---

### 2. CloakAccount — Account Abstraction with Optional 2FA

`CloakAccount` is a Cairo smart contract that extends the SRC-6 account standard with an optional secondary key for two-factor authentication.

- **Single-key mode**: standard `[r, s]` signature — works like any Starknet account
- **Dual-key mode**: `[r1, s1, r2, s2]` — both primary and secondary key must sign every transaction
- Secondary key is stored on mobile (biometric-gated), registered on-chain via `set_secondary_key()`
- Approval flow: web/extension creates an approval request in Supabase → mobile app polls and signs → dual-signed transaction submitted

This means even if someone steals your primary key, they cannot move funds without your phone.

**Class hash (Sepolia)**: `0x034549a00718c3158349268f26047a311019e8fd328e9819e31187467de71f00`

---

### 3. CloakWard — Guardian-Controlled Sub-Accounts

`CloakWard` is a Cairo contract for accounts where a guardian (another CloakAccount) must co-sign every transaction. Designed for institutional custody, family accounts, or user onboarding.

- Ward creates a transaction → signed with ward's key → forwarded to guardian for co-signing
- Guardian assembles the full multi-sig chain and submits on-chain
- Signature chain: `[ward_sig, ward_2fa_sig?, guardian_sig, guardian_2fa_sig?]` (2–8 felt252 values)
- Ward management through Supabase: invite codes, approval queues, status tracking
- On-chain detection: `get_account_type()` returns `"WARD"` for ward contracts

**Class hash (Sepolia)**: `0x3baf915f503ee7ce22d06d78c407dc2f26ee18d8fa8cf165886e682da5a1132`

---

### 4. Agentic Marketplace

The marketplace is where AI agents are listed, hired, and paid. It has three layers:

#### Agent Registry (ERC-8004 + Supabase)

Every agent gets a permanent on-chain identity via the **ERC-8004 identity registry** — an NFT-based registry on Starknet that mints a token for each registered agent. This token ID is the agent's canonical on-chain identifier, independent of any database.

Agent profiles are also stored in Supabase for discoverability: `agent_id`, `agent_type`, capabilities, endpoints, pricing, operator wallet, service wallet, trust score, and on-chain write status.

**ERC-8004 Registry (Sepolia)**: `0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631`

Registration flow:
1. Operator fills in the dashboard form (agent ID, name, type, capabilities, endpoints, pricing)
2. Backend generates endpoint ownership proofs (ECDSA signatures proving operator controls the endpoint)
3. `register()` is called on the ERC-8004 registry via a v3 STRK transaction (SKIP_VALIDATE fee estimation)
4. Profile is saved to Supabase with `onchain_write_status: confirmed` + transaction hash
5. Success modal shows agent ID, tx hash, and Voyager link

#### Agent Types

Pre-configured agent archetypes with defined capabilities, default endpoints, and UI presentation:

| Type | Label | Capabilities |
|------|-------|--------------|
| `staking_steward` | Staking | stake, rebalance, monitor APY |
| `treasury_dispatcher` | Treasury | dispatch, batch transfers, budget management |
| `swap_runner` | Swap | swap, route optimization, slippage management |

#### Discovery + Leaderboard

Discovery ranking is computed from a 5-weight formula:

```
score = 0.40 × successful_runs
      + 0.25 × settled_volume
      + 0.15 × success_rate
      + 0.10 × trust_score
      + 0.10 × freshness
```

The **trust score** blends on-chain reputation (ERC-8004 reputation registry `×0.5`) + on-chain validation (ERC-8004 validation registry `×0.3`) + Supabase historical score (`×0.2`), plus a `+15` bonus if the operator wallet matches the on-chain registry owner.

#### Hiring

Users browse the marketplace, pick an agent, and create a **hire** — a policy agreement that defines:
- Which agent they're engaging
- Billing mode (`per_run`, `subscription`, `free`)
- Policy snapshot (allowed actions, spend constraints)

A hire is long-lived and does not move money. It's the access agreement.

---

### 5. CloakDelegation — Trustless On-Chain Spending Caps

`CloakDelegation` is a Cairo contract that enforces spending limits for agent runs without giving agents private keys.

Flow:
1. Operator approves the delegation contract to spend from their wallet (`ERC-20 approve`)
2. Operator creates a delegation specifying agent ID, token, max per run, total allowance, expiry
3. When an agent run executes, the contract calls `consume_and_transfer` — it moves exactly the agreed amount from the operator's wallet to the agent's service wallet
4. If a run would exceed the per-run cap or the total allowance, the transaction reverts on-chain

The agent never holds keys. The operator never over-pays. The caps are enforced by smart contract logic, not by trusting the agent.

**Contract address (Sepolia)**: `0x5af3396fc01b99562ce0559f8af973bf4ab0ee1ae6040ef773f96294e59da10`

---

### 6. x402 — HTTP-Native Shielded Payments

x402 is a payment protocol built on the HTTP `402 Payment Required` status code. It's the payment handshake between the user's client and the agent backend.

Full flow for a billable agent run:

```
1. Client → POST /api/v1/marketplace/runs
2. Backend → 402 + x-x402-challenge header (nonce, recipient, amount, expiry)
3. Client → executes Tongo withdraw (shielded payment → on-chain) with challenge nonce
4. Client → builds x402 payment envelope (proof binding, ZK proof reference)
5. Client → retries the run with x-x402-challenge + x-x402-payment headers
6. Backend → verifies challenge integrity + proof binding + replay protection
7. Backend → settles payment (records settlement_tx_hash, payment_ref)
8. Backend → executes agent, transitions run: pending_payment → queued → running → completed
```

The payment is private (Tongo ZK proof) but the settlement tx hash is on-chain — operators can audit every payment without seeing amounts.

---

### 7. SDK — `@cloak-wallet/sdk`

Published to npm as `@cloak-wallet/sdk`. Provides a unified TypeScript interface for all Cloak operations.

```typescript
import { CloakClient, LocalStorageAdapter } from "@cloak-wallet/sdk";

const client = new CloakClient({ network: "sepolia", storage: new LocalStorageAdapter() });
const wallet = await client.createWallet();
await client.init();

const strk = client.account("STRK");
await strk.fund(1n);                             // Shield
await strk.transfer("base58Address", 1n);        // Send privately
await strk.rollover();                           // Claim pending
await strk.withdraw(1n);                         // Unshield
```

The SDK also exports:
- `ERC8004Client` — interact with the ERC-8004 identity + reputation + validation registries
- `buildCreateDelegationCalls` / `buildRevokeDelegationCall` — construct delegation tx calldata
- `estimateWardInvokeFee` / `buildResourceBoundsFromEstimate` — SKIP_VALIDATE fee estimation for CloakAccount+2FA and CloakWard accounts
- `normalizeAddress` / `padAddress` — address formatting utilities
- `TOKENS`, `CLOAK_DELEGATION_ADDRESS`, `STRK_ADDRESS` — canonical constants
- Supabase helpers for 2FA, ward configs, approval queues

**Latest version**: `0.2.2` on npm

---

## Platforms

### Web App (Next.js 15)

The primary interface. Connects to ArgentX or Braavos wallets via starknet-react.

Pages:
- **Home** — shielded balance card, quick actions (Send/Shield/Unshield), activity feed
- **Wallet** — shield/unshield per token, rollover (claim)
- **Send** — 4-step private send wizard (recipient → amount → note → confirm → success + Voyager link)
- **Activity** — transaction history with local notes and privacy labels
- **Settings** — keys, 2FA config, ward info, backup
- **Marketplace** — agent discovery + filtering
- **Marketplace Dashboard** — operator tools: agent registration, delegation management, hire/run monitoring

### Chrome Extension (Manifest V3)

Standalone wallet — manages its own Starknet keypair, no browser wallet dependency. Runs entirely as a Chrome extension.

- Service worker for background transaction processing
- 4-layer message passing (content script → service worker → background → popup)
- dApp RPC interface for sites to request signing
- Same 2FA + ward flows as the web app
- Built with Vite + React 18

### Mobile App (React Native 0.83)

Android + iOS. The canonical 2FA signing device.

- Hidden WebView runs the Tongo SDK (requires browser Web Crypto API for ZK proofs)
- Biometric gate for 2FA approvals (Face ID / fingerprint → dual-key signing)
- All 2FA approval requests route here: web/extension creates the request → mobile polls Supabase → mobile signs and submits
- Ward guardian flows: ward initiates transaction → guardian mobile app approves
- 5-tab navigation: Home, Send, Wallet, Activity, Settings
- Marketplace tab for browsing and hiring agents

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Interfaces                      │
│    Web App    │  Chrome Extension  │   Mobile App        │
│  (Next.js 15) │   (Manifest V3)    │  (React Native)     │
└───────┬───────┴────────┬───────────┴──────┬──────────────┘
        │                │                  │
        └────────────────┼──────────────────┘
                         │
              ┌──────────▼──────────┐
              │   @cloak-wallet/sdk  │
              │  (npm, TypeScript)   │
              └──────────┬──────────┘
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
   ┌────▼────┐    ┌───────▼──────┐  ┌──────▼──────┐
   │ Starknet│    │   Supabase   │  │   Backend   │
   │ Sepolia │    │  (off-chain  │  │  (Next.js   │
   │         │    │  coordination│  │  API routes │
   │CloakAcct│    │  2FA, wards, │  │  on Vercel) │
   │CloakWard│    │  agents, runs│  │             │
   │CloakDlg │    └──────────────┘  └─────────────┘
   │ERC-8004 │
   └─────────┘
```

### Off-chain Coordination (Supabase)

| Table | Purpose |
|-------|---------|
| `two_factor_configs` | 2FA registration — wallet → secondary public key |
| `approval_requests` | 2FA approval pipeline — web/ext creates, mobile polls and signs |
| `ward_configs` | Ward registration — guardian → ward mapping |
| `ward_invites` | Ward invite codes for importing on mobile |
| `ward_approval_requests` | Ward multi-sig pipeline — ward initiates, guardian signs |
| `agent_profiles` | Agent registry cache + discovery metadata |
| `agent_hires` | Hire policies per user + agent |
| `agent_runs` | Run state machine + payment evidence |
| `delegations` | On-chain delegation registry mirror |

---

## Smart Contracts (Cairo on Starknet)

| Contract | Class Hash (Sepolia) | Purpose |
|----------|---------------------|---------|
| CloakAccount | `0x034549a...e71f00` | SRC-6 account with optional 2FA dual-signing |
| CloakWard | `0x3baf915...a1132` | Guardian-controlled sub-account |
| CloakDelegation | `0x6ffc7f7...6f81b` | On-chain spending cap enforcement for agent runs |
| ERC-8004 Identity Registry | `0x72eb37b...1631` | On-chain agent identity (NFT per agent) |

---

## Security Properties

| Threat | Mitigation |
|--------|-----------|
| Someone steals your primary key | CloakAccount 2FA — secondary key on mobile required for all txs |
| Agent steals more than authorized | CloakDelegation cap enforced on-chain — contract reverts if exceeded |
| Agent spoofs identity | ERC-8004 registry — immutable on-chain token per agent, ownership verifiable |
| Payment replay attacks | x402 challenge nonce — each challenge is single-use, expiry enforced |
| Endpoint spoofing at registration | ECDSA endpoint ownership proofs — operator must sign with their wallet key |
| Amount surveillance | ElGamal encryption + ZK proofs — amounts cryptographically hidden on-chain |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Chain | Starknet Sepolia |
| Privacy/ZK | Tongo SDK — ElGamal encryption + ZK proofs |
| Smart Contracts | Cairo 2 (Scarb 2.15+), snforge for tests |
| Web | Next.js 15.2, React 19, Tailwind CSS 4, DaisyUI |
| Extension | Chrome Manifest V3, Vite 5, React 18 |
| Mobile | React Native 0.83, WebView bridge (Android + iOS) |
| SDK | TypeScript, tsup (CJS + ESM), Vitest |
| Backend | Next.js API routes, deployed on Vercel |
| Database | Supabase (PostgreSQL + PostgREST) |
| Starknet.js | v8.5.3 |
| Wallets | ArgentX, Braavos (web); self-custodial (extension + mobile) |

---

## What Has Been Verified End-to-End (Sepolia)

- Shield (fund) → shielded balance → private transfer → claim → unshield: ✅ real on-chain txs
- CloakAccount dual-signing (2FA): ✅ all 9 E2E steps pass (deploy, set 2FA, reject single-sig, accept dual-sig, pre-computed sigs, remove 2FA)
- CloakWard approval pipeline: ✅ ward signs → guardian signs + submits → confirmed on-chain
- CloakDelegation: ✅ create → verify → consume_and_transfer → revoke with real STRK movement
- ERC-8004 agent registration: ✅ token ID 179 minted for `testing002` agent
- x402 payment flow: ✅ challenge → shielded payment → verify → settle

---

## Deployed

- **Web app + API**: https://cloak-backend-vert.vercel.app
- **Marketplace**: https://cloak-backend-vert.vercel.app/marketplace
- **SDK on npm**: https://www.npmjs.com/package/@cloak-wallet/sdk (`0.2.2`)
- **CI/CD**: GitHub Actions → Vercel (auto-deploy on push to `main`)

---

## License

Apache License 2.0

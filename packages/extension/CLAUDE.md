# Cloak Chrome Extension

## Overview

Self-custodial privacy wallet Chrome extension built with Manifest V3, React 18, Vite, and Tailwind CSS. Stores keys locally via `chrome.storage.local`, communicates with the Tongo SDK through the background service worker, and supports dApp integration via injected window provider (`window.starknet_cloak`).

## Architecture

```
src/
├── background/
│   ├── index.ts                  Service worker (main logic, message handler, approval system)
│   └── transaction-router.ts     Ward/2FA transaction routing, fee estimation, Supabase polling
├── popup/
│   ├── main.tsx                  Popup entry point
│   ├── App.tsx                   Main router (screens: main, shield, send, withdraw, etc.)
│   ├── approve-main.tsx          Approval window entry point
│   ├── hooks/
│   │   ├── useExtensionWallet.ts Wallet state, balance, CRUD, transactions
│   │   ├── useWard.ts            Ward detection, ward info
│   │   ├── useContacts.ts        Contact management
│   │   └── useTxHistory.ts       Transaction history with metadata
│   ├── components/
│   │   ├── Onboarding.tsx        Create/import wallet, ward import
│   │   ├── DeployScreen.tsx      Account deployment gate
│   │   ├── BalanceCard.tsx       Shielded/pending/public balance display
│   │   ├── ShieldForm.tsx        Shield (fund) form
│   │   ├── SendForm.tsx          Private send form with contacts
│   │   ├── WithdrawForm.tsx      Unshield (withdraw) form
│   │   ├── ReceiveScreen.tsx     Address display (Tongo + Starknet)
│   │   ├── Settings.tsx          Keys, network, backup, clear wallet
│   │   ├── ActivityScreen.tsx    Transaction history list
│   │   ├── ContactsScreen.tsx    Contact CRUD
│   │   ├── ApproveScreen.tsx     dApp approval popup (separate window)
│   │   ├── TxConfirmModal.tsx    Pre-send confirmation dialog
│   │   ├── TxSuccessModal.tsx    Post-tx success with hash + Voyager link
│   │   ├── TwoFactorWaiting.tsx  2FA/ward approval waiting modal
│   │   ├── ClaimSuccessScreen.tsx Rollover success
│   │   ├── TokenSelector.tsx     STRK/ETH/USDC tabs
│   │   └── CloakIcon.tsx         Logo SVG
│   └── lib/
│       └── storage.ts            Contacts + tx notes in chrome.storage.local
├── content/
│   └── index.ts                  Content script: bridges injected ↔ background
├── injected/
│   └── index.ts                  Page context: exposes window.starknet_cloak
└── shared/
    ├── messages.ts               Request/response types, sendMessage helper
    ├── two-factor.ts             2FA detection (on-chain + Supabase fallback)
    ├── ward-approval.ts          Ward detection wrapper
    └── supabase-config.ts        Supabase client singleton (chrome.storage.local config)
```

## Message Flow

```
dApp Page (window.starknet_cloak.request())
    ↕ postMessage
Injected Script (src/injected/index.ts)
    ↕ postMessage
Content Script (src/content/index.ts)
    ↕ chrome.runtime.sendMessage
Background Service Worker (src/background/index.ts)
    ↕ chrome.storage.local
Extension Storage
```

**Popup ↔ Background**: Same `chrome.runtime.sendMessage` with typed request/response.

## Message Types (`shared/messages.ts`)

| Message | Direction | Purpose |
|---------|-----------|---------|
| `CREATE_WALLET` | popup→bg | Generate new keypair |
| `IMPORT_WALLET` | popup→bg | Import private key |
| `GET_WALLET` / `HAS_WALLET` | popup→bg | Read wallet state |
| `DEPLOY_ACCOUNT` | popup→bg | Deploy on-chain |
| `IS_DEPLOYED` | popup→bg | Check deployment status |
| `GET_STATE` | popup→bg | Shielded balance + nonce |
| `GET_ERC20_BALANCE` | popup→bg | Public balance |
| `FUND` / `TRANSFER` / `WITHDRAW` / `ROLLOVER` | popup→bg | Core operations |
| `CHECK_WARD` | popup→bg | Ward account detection |
| `WALLET_RPC` | content→bg | dApp RPC calls |
| `GET_PENDING_APPROVAL` / `RESOLVE_APPROVAL` | approve→bg | Approval window |
| `2FA_STATUS_UPDATE` / `2FA_COMPLETE` | bg→popup | 2FA waiting status |

## Transaction Router (`background/transaction-router.ts`)

Central routing logic for all transactions:

```
1. Check if ward account → signAndRequestGuardian() → poll Supabase for guardian
2. Check if 2FA enabled → request2FAApproval() → poll Supabase for mobile
3. Neither → direct account.execute()
```

**Fee estimation**: Uses `estimateWardInvokeFee()` + `buildResourceBoundsFromEstimate()` for dynamic gas estimation (SKIP_VALIDATE). Retries up to 2 times with increasing safety multiplier on gas errors.

**Amount formatting**: Before inserting ward requests into Supabase, formats amounts via `formatWardAmount()` for human-readable display on guardian's device.

## dApp Integration RPC Methods

Exposed via `window.starknet_cloak.request(call)`:

**Standard wallet methods:**
- `wallet_requestAccounts` → `[address]`
- `wallet_requestChainId` → `"SN_SEPOLIA"`
- `wallet_addInvokeTransaction(calls)` → routes through transaction-router
- `wallet_signTypedData(params)` → signs via Account.signMessage()

**Custom Cloak privacy methods:**
- `cloak_getShieldedState(token?)` → `{ balance, pending, nonce }`
- `cloak_fund(token?, amount)` → shield tokens
- `cloak_transfer(token?, to, amount)` → private send
- `cloak_withdraw(token?, amount)` → unshield
- `cloak_rollover(token?)` → claim pending
- `cloak_getTongoAddress()` → base58 address

Methods requiring approval open a separate popup window (400x560px).

## Approval System

1. dApp calls `wallet_addInvokeTransaction`
2. Background stores pending approval with resolve callback
3. Opens new popup window (`approve.html`)
4. ApproveScreen shows transaction details + approve/reject
5. On approve: routes through transaction-router (may trigger 2FA/ward waiting)
6. On window close without action: auto-rejects

## Hooks

### `useExtensionWallet`
Central wallet state hook: `wallet`, `loading`, `selectedToken`, `balances`, `erc20Balance`, `isDeployed`, `error`. Methods: `createWallet()`, `importWallet()`, `clearWallet()`, `deployAccount()`, `refreshBalances()`, `fund()`, `transfer()`, `withdraw()`, `rollover()`.

### `useWard`
Ward detection: `isWard`, `isCheckingWard`, `wardInfo`. Auto-refreshes on address change.

### `useContacts`
Contact CRUD: `contacts[]`, `addContact()`, `removeContact()`, `getContactByAddress()`.

## Storage

**`chrome.storage.local`** keys:
- SDK wallet keys (via `ExtensionStorageAdapter`)
- `cloak_contacts` — JSON array of contacts
- `cloak_tx_notes` — JSON object of tx metadata
- `cloak_supabase_url` / `cloak_supabase_key` — Supabase config

## Build

```bash
npm run build     # tsc + vite build → dist/
npm run dev       # vite watch mode
```

**Vite config** produces 5 entry points: `popup.js`, `approve.js`, `background.js`, `content.js`, `injected.js`.

**Load in Chrome**: `chrome://extensions` → Load unpacked → select `dist/` folder.

## UI Design

- **Color scheme**: Dark theme with Tailwind custom classes (`bg-cloak-bg`, `text-cloak-text`, `bg-cloak-primary`)
- **Popup size**: 400x580px (standard extension popup)
- **Ward badge**: Green "WARD" badge in header when account is ward
- **Token selector**: STRK/ETH/USDC tabs with colored dots
- **2FA waiting**: Pulsing phone icon, countdown timer, cancel button
- **Ward waiting**: Same component with "Guardian Approval Required" title

## Error Handling

User-friendly error mapping in forms:
- `"invalid point"` → "Invalid recipient address"
- `"nonce too old"` → "Transaction conflict. Please try again."
- `"execution reverted"` → "Transaction was rejected by the network."
- `"timeout"` → "Request timed out. Check your connection."

## Key Notes

1. **BigInt serialization**: All message passing between popup ↔ background converts BigInt to string.
2. **Service worker context**: Background script needs `(globalThis as any).window = globalThis;` polyfill.
3. **No state persistence**: Wallet re-fetched on each popup open (prevents stale state).
4. **Ward vs 2FA**: Two separate systems with independent approval flows.
5. **Supabase config override**: Users can customize Supabase URL/key via `chrome.storage.local`.

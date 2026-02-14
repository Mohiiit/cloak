# Cloak Web App (Next.js)

## Overview

Next.js 15 web application for the Cloak privacy wallet. Connects to Starknet wallets (ArgentX, Braavos) via starknet-react, manages shielded operations via the Tongo SDK, and supports 2FA and ward account flows through Supabase polling.

## Tech Stack

- **Framework**: Next.js 15.2.6, React 19.0.1
- **Styling**: Tailwind CSS 4 + DaisyUI
- **State**: React Context (TongoProvider), Zustand (scaffold state)
- **Blockchain**: starknet.js 8.5.3, starknet-react 5.0.1
- **SDK**: @cloak-wallet/sdk (workspace), @fatsolutions/tongo-sdk 1.3.1
- **UI**: Lucide React, Radix UI Themes, Framer Motion
- **Notifications**: react-hot-toast

## Architecture

```
app/
├── layout.tsx                Root layout (HTML, ThemeProvider)
├── page.tsx                  Home (hero, balance card, quick actions, activity feed)
├── wallet/page.tsx           Shield/unshield operations, token balances
├── send/page.tsx             Multi-step private send (recipient → amount → note → confirm)
├── activity/page.tsx         Transaction history with local metadata
├── contacts/page.tsx         Contact management
├── settings/page.tsx         Keys, 2FA config, ward info, backup, privacy
└── api/price/route.ts        STRK/USD price from CoinGecko

components/
├── ScaffoldStarkAppWithProviders.tsx  Provider stack (StarknetConfig, TongoProvider, Layout)
├── Header.tsx                         Sticky header, balance pill, connect button
├── BottomNav.tsx                      Mobile bottom nav (Home, Send, Wallet, Settings)
├── TwoFactorWaiting.tsx              2FA/ward approval waiting modal
├── CloakIcon.tsx                      Logo component
├── ThemeProvider.tsx                   Dark theme
├── providers/
│   └── TongoProvider.tsx              Tongo account context (per-token, lazy init)
└── scaffold-stark/
    └── CustomConnectButton/           Wallet connection UI (connect, disconnect, QR, network)

hooks/
├── useTongoBalance.ts        Shielded balance (auto-polls 15s)
├── useTongoFund.ts           Shield operation
├── useTongoTransfer.ts       Private send
├── useTongoWithdraw.ts       Unshield operation
├── useTongoRollover.ts       Claim pending
├── useTongoHistory.ts        Transaction history with local notes
├── use2FA.ts                 2FA approval gate
├── useWard.ts                Ward detection + guardian info + ward list
├── useWardApproval.ts        Ward approval gate
├── useTransactionRouter.ts   Central tx routing (ward → 2FA → direct)
├── useAccount.ts             Wrapper for starknet-react useAccount
└── useContacts.ts            Contact CRUD

lib/
├── tokens.ts                 Token config + formatting
├── address.ts                Address padding, truncation
├── constants.ts              Curve order, storage keys, poll interval
├── storage.ts                localStorage helpers (contacts, tx notes, settings)
├── tongo-key.ts              Tongo private key management
├── two-factor.ts             2FA Supabase flow (check, request, poll)
└── ward-approval.ts          Ward approval Supabase flow
```

## Provider Stack

```
StarknetConfig (chains, connectors, provider, explorer)
└── TongoProvider (Tongo account, balance state, token selection)
    └── Layout (Header, BottomNav, main content)
        └── Toaster (notifications)
```

## Transaction Routing (`hooks/useTransactionRouter.ts`)

All Tongo operation hooks route through `executeOrRoute()`:

```
1. Check if ward → requestWardApproval() via Supabase
2. Check if 2FA enabled → request2FAApproval() via Supabase
3. Otherwise → direct account.execute(calls)
```

The web app does NOT sign 2FA transactions itself — it delegates to the mobile app via Supabase polling.

## Hooks

### Tongo Operations
All return `{ action, isPending, isSuccess, txHash, error, reset }`:
- **useTongoFund**: `fund(tongoAmount)` — shield tokens
- **useTongoTransfer**: `transfer(recipientBase58, tongoAmount)` — private send
- **useTongoWithdraw**: `withdraw(tongoAmount)` — unshield
- **useTongoRollover**: `rollover()` — claim pending
- **useTongoBalance**: `{ balance, pending, nonce, shieldedDisplay, pendingDisplay, isLoading, refresh }` — auto-polls every 15s

### Authentication
- **use2FA**: `gate(params)` — insert 2FA request, poll Supabase, return approval result
- **useWardApproval**: `checkNeeds(wardAddress)` + `gate(params)` — ward multi-sig flow

### State
- **useWard**: `{ isWard, wardInfo, wards, checkIfWard, refreshWardInfo, refreshWards }`
- **useAccount**: Wraps starknet-react with fixes for status inconsistencies
- **useContacts**: `{ contacts, addContact, removeContact, updateContact, toggleFavorite }`

## TongoProvider (`components/providers/TongoProvider.tsx`)

```typescript
interface TongoContextValue {
  tongoAccount: TongoAccount | null;
  isInitialized: boolean;
  tongoAddress: string;           // base58
  selectedToken: TokenKey;
  setSelectedToken(token): void;
  refreshState(): Promise<void>;
  tongoPrivateKey: string;
}
```

- Initializes Tongo account when wallet connects
- Generates/loads Tongo private key from localStorage
- Switches token contract based on `selectedToken`

## Pages

### Home (`page.tsx`)
- Hero section for disconnected users
- Ward banner (if ward account)
- Shielded balance card → links to /wallet
- Quick action buttons (Send, Shield, Unshield)
- Recent activity feed (up to 10 events)
- Network status + nonce indicator

### Wallet (`wallet/page.tsx`)
- Shielded + pending + public balances
- Balance visibility toggle
- Shield/Unshield modals with amount input (25%, 50%, MAX buttons)
- Rollover (claim) button for pending funds
- 2FA/ward approval waiting modal during operations

### Send (`send/page.tsx`)
Multi-step wizard:
1. Recipient input (Tongo address validation) + contact quick-select
2. Amount input + balance indicator + percentage buttons
3. Note field + emoji quick-insert + privacy level selector
4. Confirmation summary
5. Success screen with tx hash + Voyager link

### Settings (`settings/page.tsx`)
- Cloak Address + Starknet Address (display + copy)
- Ward Account Info (guardian, status, approval requirements)
- Ward List (if guardian — managed wards with status badges)
- 2FA Settings (status, Supabase URL/key config)
- Backup Private Key (show/hide + copy)
- Default Privacy Level selector
- Danger Zone (clear all data with confirmation)

## Wallet Connection

Connectors: ArgentX, Braavos, Keplr, Burner (devnet only)

```typescript
// scaffold.config.ts
{
  targetNetworks: [chains.sepolia],
  walletAutoConnect: true,
  autoConnectTTL: 60000,
  pollingInterval: 30_000
}
```

## Styling

Dark theme with Tailwind CSS 4 + DaisyUI:
- Primary: Blue (#93BBFB / #3B82F6)
- Secondary: Purple (#8B5CF6)
- Background: Slate 900
- Cards: `rounded-xl bg-slate-800/50 border border-slate-700/30`
- Modals: `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm`
- Mobile-first with `max-w-lg` container

## Build

```bash
npm run dev      # Dev server (port 3000)
npm run build    # Production build
npm run start    # Production server
npm test         # Vitest
```

## Environment

```
NEXT_PUBLIC_SEPOLIA_PROVIDER_URL=...  # Alchemy Sepolia RPC
NEXT_PUBLIC_DEVNET_PROVIDER_URL=...   # Local devnet (optional)
NEXT_PUBLIC_MAINNET_PROVIDER_URL=...  # Mainnet (optional)
```

## Key Notes

1. **Web app cannot hold 2FA keys**: It delegates signing to mobile via Supabase polling. The web app creates the approval request; the mobile app signs and submits.
2. **Tongo private key**: Separate from Starknet key. Generated randomly, stored in localStorage (`cloak_tongo_key`). Used to derive Tongo address (base58).
3. **Balance polling**: 15-second interval via `useTongoBalance`. Manual refresh available.
4. **Local metadata**: Transaction notes, recipient names, privacy levels stored in localStorage and merged with on-chain event data.
5. **Privacy levels**: "Public" / "Friends" / "Private" — purely local tags, not enforced on-chain.
6. **Token switching**: Changes Tongo contract, re-initializes TongoAccount, refreshes balances.
7. **No private key in web context**: Web uses connected wallet (ArgentX/Braavos) for signing. Tongo key is only for address derivation.

# Cloak Coffee — Private "Buy Me a Coffee" Template

A single-page "Buy Me a Coffee" dApp built with [Cloak Wallet](https://github.com/mohiiit/cloak) for private, shielded tips on Starknet.

Visitors can tip a creator using privacy-preserving shielded transfers — no one can see how much was sent or to whom.

## Quick Start

```bash
npx degit mohiiit/cloak/cloak-template my-coffee-app
cd my-coffee-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Setup

1. Install the [Cloak browser extension](https://github.com/mohiiit/cloak)
2. Create a Cloak wallet and fund it with Sepolia STRK
3. Edit `src/lib/constants.ts` — set your Tongo address as the recipient:

```typescript
export const RECIPIENT_TONGO_ADDRESS = "your_tongo_address_here";
```

4. Customize the coffee tiers if you like:

```typescript
export const COFFEE_TIERS = [
  { id: 1, label: "1 Coffee",   units: "1", strk: "0.05", emoji: "☕" },
  { id: 3, label: "3 Coffees",  units: "3", strk: "0.15", emoji: "🔥" },
  { id: 5, label: "5 Coffees",  units: "5", strk: "0.25", emoji: "🚀" },
];
```

## How It Works

```
Visitor connects Cloak Wallet
  → Selects a coffee tier (1/3/5)
  → Sends shielded transfer to creator's Tongo address
  → Transaction is private — amount and recipient hidden
  → Success modal with Starkscan explorer link
```

## Architecture

```
dApp (this template)
  ↕ window.starknet_cloak.request()
Cloak Extension (injected provider)
  ↕ content script bridge
Background Service Worker → Tongo SDK → Starknet
```

### Cloak RPC Methods Used

- `cloak_getShieldedState` — show visitor's shielded balance
- `cloak_transfer` — send private tip to creator

### Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout + WalletProvider
│   ├── page.tsx            # Single-page coffee tip UI
│   └── globals.css         # Tailwind + animations
├── components/
│   ├── Header.tsx          # Logo + connect wallet
│   ├── CoffeeCard.tsx      # Tier selector + send button
│   ├── BalanceBar.tsx      # Shielded balance display
│   ├── SuccessModal.tsx    # Post-transaction modal
│   └── CloakBadge.tsx      # "Powered by Cloak" badge
└── lib/
    ├── cloak.ts            # RPC helpers
    ├── constants.ts        # Recipient, tiers, config
    └── providers.tsx       # WalletProvider context
```

## Tech Stack

- **Next.js 14** (App Router)
- **Tailwind CSS** (dark theme with coffee accents)
- **Cloak Wallet Provider** (StarknetWindowObject)
- **Lucide React** (icons)

## License

MIT

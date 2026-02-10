# Cloak — Social Shielded Payments on Starknet

> Cloak your payments. Social transactions, cryptographically private.

Cloak is a Venmo-like private payment wallet built on Starknet. Send shielded payments to friends with notes and emojis — the social feed shows who paid whom and why, but **amounts are always hidden** using Tongo's ElGamal encryption and zero-knowledge proofs.

## What it does

- **Shield funds** — Deposit ERC20 tokens (STRK, ETH, USDC) into a private pool
- **Send shielded payments** — Transfer to any Cloak address; amounts are encrypted on-chain
- **Social feed** — Transactions show notes and emojis, never amounts
- **Manage contacts** — Save Cloak addresses for quick payments
- **Claim pending** — Roll over incoming transfers to your balance
- **Unshield** — Withdraw back to your public wallet anytime

## How it works

```
Public Wallet (ERC20)
        │
   ┌────▼────┐      ElGamal Encryption
   │  Shield  │  ──────────────────────►  Encrypted Balance
   └─────────┘                            (on-chain, hidden)
                                               │
                    ZK Proof                    │
   ┌──────────┐  ◄──────────────  ┌────────────▼──────────┐
   │ Unshield │                   │ Shielded Transfer     │
   └────┬─────┘                   │ (amount hidden, note  │
        │                         │  visible in social    │
        ▼                         │  feed)                │
   Public Wallet                  └───────────────────────┘
```

1. **Tongo SDK** handles all encryption, proof generation, and on-chain operations
2. Each user gets a separate Tongo keypair (stored in browser localStorage)
3. Transfers are encrypted with ElGamal — only sender and receiver can decrypt amounts
4. The social feed shows transaction notes/emojis but never amounts

## Screenshots

| Home | Send Payment | Payment Sent |
|:----:|:----:|:------:|
| ![Home](docs/screenshots/home-connected.png) | ![Send](docs/screenshots/send-step3-note.png) | ![Sent](docs/screenshots/send-success.png) |

| Wallet | Pending Funds | Shield Modal |
|:------:|:--------:|:--------:|
| ![Wallet](docs/screenshots/wallet-connected.png) | ![Pending](docs/screenshots/wallet-pending.png) | ![Shield](docs/screenshots/wallet-shield-modal.png) |

| Contacts | Settings |
|:--------:|:--------:|
| ![Contacts](docs/screenshots/contacts-connected.png) | ![Settings](docs/screenshots/settings-connected.png) |

## How to Use

### 1. Connect Your Wallet

Install [ArgentX](https://www.argent.xyz/) or [Braavos](https://braavos.app/) and switch to **Starknet Sepolia**. Click **Connect Wallet** on the home page. On first connect, Cloak generates your private Tongo keypair automatically — this is your Cloak identity.

![Home](docs/screenshots/home-connected.png)

### 2. Shield Funds

Go to the **Wallet** tab. Tap **Shield** to deposit ERC20 tokens (STRK, ETH, or USDC) from your public wallet into your shielded balance. Enter the amount and confirm the transaction.

| Wallet | Shield Modal |
|:------:|:------------:|
| ![Wallet](docs/screenshots/wallet-connected.png) | ![Shield](docs/screenshots/wallet-shield-modal.png) |

Once confirmed, your shielded balance updates — the amount is now encrypted on-chain.

### 3. Send a Shielded Payment

Go to the **Send** tab. The 3-step wizard walks you through:

1. **To** — Enter the recipient's Cloak address (base58) or pick from contacts
2. **Amount** — Choose how much to send from your shielded balance
3. **Confirm** — Add a note and emoji, then review and send

| Confirm Payment | Payment Sent |
|:---------------:|:------------:|
| ![Confirm](docs/screenshots/send-step3-note.png) | ![Sent](docs/screenshots/send-success.png) |

The transaction note and emoji appear in the social feed, but the **amount is never revealed** — it's encrypted with ElGamal so only sender and receiver can see it.

### 4. Claim Pending Funds

When someone sends you a shielded payment, it appears as **Pending** in your Wallet. Tap **Claim** to roll the pending amount into your spendable shielded balance.

![Pending](docs/screenshots/wallet-pending.png)

### 5. Manage Contacts

Save frequently used Cloak addresses in the **Contacts** tab for quick payments. Share your own Cloak address with friends so they can send to you.

![Contacts](docs/screenshots/contacts-connected.png)

### 6. Backup Your Key

Go to **Settings** to copy your Cloak address or back up your Tongo private key. Keep this key safe — it's the only way to decrypt your shielded balance.

![Settings](docs/screenshots/settings-connected.png)

### 7. Unshield

When you want to move funds back to your public wallet, go to **Wallet** and tap **Unshield**. This generates a ZK proof and withdraws the specified amount to your connected Starknet address.

## Key Features

- **Privacy by default** — All balances and transfer amounts are encrypted
- **Social payments** — Add notes, emojis, and privacy levels to transactions
- **Multi-token** — Supports STRK, ETH, and USDC on Sepolia
- **Contact management** — Save and organize payment contacts
- **Mobile-first** — Optimized for mobile with bottom navigation
- **Key backup** — Export your Tongo private key from settings

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Chain | Starknet Sepolia |
| Privacy | [Tongo SDK](https://www.npmjs.com/package/@fatsolutions/tongo-sdk) (ElGamal + ZK proofs) |
| Frontend | Next.js 15, React 19, TypeScript |
| Scaffold | [Scaffold-Stark 2](https://scaffoldstark.com/) |
| Styling | Tailwind CSS 4, DaisyUI 5 |
| Animation | Framer Motion |
| Identity | starknetid.js |
| Wallets | ArgentX, Braavos |

## Getting Started

### Prerequisites

- Node.js >= v22
- Yarn (v3, included in repo)
- ArgentX or Braavos wallet extension

### Setup

```bash
git clone https://github.com/Mohiiit/cloak.git
cd cloak
yarn install
```

### Run

```bash
yarn start
```

Open [http://localhost:3000](http://localhost:3000)

### Environment

The `.env` is auto-created from `.env.example` with a Sepolia RPC URL.

## Project Structure

```
cloak/
├── docs/                     # Research & build plan
├── packages/
│   ├── nextjs/               # Frontend app
│   │   ├── app/              # Next.js app router pages
│   │   │   ├── page.tsx      # Home (hero + feed)
│   │   │   ├── send/         # Send payment wizard
│   │   │   ├── wallet/       # Shield/unshield funds
│   │   │   ├── activity/     # Transaction history
│   │   │   ├── contacts/     # Contact management
│   │   │   └── settings/     # Key backup, preferences
│   │   ├── components/
│   │   │   ├── providers/    # TongoProvider context
│   │   │   ├── Header.tsx    # Cloak header with balance
│   │   │   └── BottomNav.tsx # Mobile navigation
│   │   ├── hooks/            # Tongo operation hooks
│   │   │   ├── useTongoBalance.ts
│   │   │   ├── useTongoFund.ts
│   │   │   ├── useTongoTransfer.ts
│   │   │   ├── useTongoWithdraw.ts
│   │   │   ├── useTongoRollover.ts
│   │   │   └── useTongoHistory.ts
│   │   └── lib/              # Utilities
│   │       ├── tokens.ts     # Token config + formatting
│   │       ├── tongo-key.ts  # Key management
│   │       ├── address.ts    # Address padding/truncation
│   │       └── storage.ts    # LocalStorage abstraction
│   └── snfoundry/            # Cairo contracts
└── README.md
```

## Sepolia Token Contracts

| Token | Tongo Contract |
|-------|---------------|
| STRK | `0x0408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed` |
| ETH | `0x02cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5` |
| USDC | `0x02caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552` |

## Built for Re{define} Hackathon

**Privacy Track** — $9,675 STRK + $1,000 Fat Solutions Bounty

Core insight: Venmo already hides amounts from the social feed — Cloak makes this cryptographic and on-chain using Tongo's ElGamal encryption, rather than a UI choice.

## License

MIT

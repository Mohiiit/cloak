# Social Shielded Payments — Detailed Build Plan

## Key Research Findings That Change the Original Plan

1. **No epoch constraints** — Tongo has NO timing limits on transfers (unlike the Zether paper). This simplifies UX significantly — no cooldown timers needed.
2. **Separate Tongo keypair** — Users need a Tongo-specific private key stored in localStorage, separate from their Starknet wallet. This adds a key management UX concern.
3. **Rate conversion is non-trivial** — Each token has a different rate. Must use `erc20ToTongo()` / `tongoToErc20()` for all amount conversions.
4. **Address padding is critical** — All addresses must be 0x + 64 hex chars for ZK proofs to work.
5. **starknet.js v8.x required** — Both Tongo SDK and starknetid.js need starknet v8. Scaffold-Stark 2 should be compatible but verify.
6. **SDK type conflicts** — Tongo bundles its own starknet.js, requiring `as any` casts for provider.
7. **Scaffold-Stark 2 uses DaisyUI** — Can leverage existing theme system instead of building from scratch.
8. **Balance max ~42,949 USDC** — Sufficient for hackathon demo but worth noting.

---

## Phase 0 — Environment Setup & SDK Validation (Days 1-2, ~10 hours)

### Task 0.1: Scaffold Project + Dependencies (2h)
**What:** Create project with Scaffold-Stark 2, install all deps.
```bash
npx create-stark@latest  # name: social-shielded-payments
cd social-shielded-payments
cd packages/nextjs
yarn add @fatsolutions/tongo-sdk starknetid.js @emoji-mart/react @emoji-mart/data
```
**Verify:**
- `starknet` peer dep is v8.x (matches Tongo SDK requirement of 8.5.4)
- TypeScript can import from `@fatsolutions/tongo-sdk`
- `yarn start` shows app at localhost:3000

**Risk:** Version conflicts between Scaffold-Stark's starknet.js and Tongo SDK's requirement.
**Mitigation:** Pin `starknet@8.5.4` if needed.

### Task 0.2: SDK Integration Smoke Test (3h)
**What:** Write a minimal script that:
1. Creates an `RpcProvider` pointing to Sepolia
2. Instantiates a `TongoAccount` with a test private key and the STRK Tongo contract (`0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed`)
3. Calls `account.state()` and `account.rate()`
4. Confirms the SDK works end-to-end

**Acceptance:** Console logs show `{ balance: 0n, pending: 0n, nonce: 0n }` and a valid rate.

### Task 0.3: Configure Sepolia Network (2h)
**What:**
- Update `scaffold.config.ts` → `targetNetworks: [chains.sepolia]`
- Set up `.env` with Alchemy/Blast Sepolia RPC URL
- Get test STRK from faucet
- Verify wallet connection works on Sepolia

### Task 0.4: Vite/Next.js Bundler Config (1.5h)
**What:** Handle the known Tongo SDK bundling issues:
- Add Vite alias for `@fatsolutions/tongo-sdk/dist/types.js` if needed
- Configure `optimizeDeps.include` for the SDK
- Handle any WASM or crypto polyfills needed for ElGamal operations

### Task 0.5: Starknet ID Verification (1.5h)
**What:** Test `.stark` name resolution on Sepolia:
```typescript
const navigator = new StarknetIdNavigator(provider, constants.StarknetChainId.SN_SEPOLIA);
await navigator.getAddressFromStarkName("testname.stark");
```
- Verify `useStarkName` and `useStarkProfile` hooks from starknet-react work

---

## Phase 1 — Core Tongo Wallet (Days 3-7, ~30 hours)

### Task 1.1: Tongo Key Management (4h)
**What:** Build key generation, storage, and recovery system.
**Files:**
- `packages/nextjs/lib/tongo-key.ts` — Key management utilities
- `packages/nextjs/components/providers/TongoProvider.tsx` — React context

**Implementation:**
```typescript
// lib/tongo-key.ts
const STORAGE_KEY = 'tongo_private_key';
const CURVE_ORDER = 3618502788666131213697322783095070105526743751716087489154079457884512865583n;

export function getOrCreateTongoKey(): string {
  let key = localStorage.getItem(STORAGE_KEY);
  if (key && isValidKey(key)) return key;
  key = generateRandomKey();
  localStorage.setItem(STORAGE_KEY, key);
  return key;
}

function isValidKey(key: string): boolean {
  const n = BigInt(key);
  return n >= 1n && n < CURVE_ORDER;
}
```

**TongoProvider context exposes:**
- `tongoAccount: TongoAccount | null`
- `isInitialized: boolean`
- `tongoAddress: string` (base58)
- `publicKey: PubKey`
- `refreshState: () => Promise<void>`
- Selected token contract address

**Critical UX decision:** Show a "backup your key" prompt since the Tongo key is separate from the wallet. For hackathon MVP, just store in localStorage and show the key in settings for manual backup.

### Task 1.2: Token Configuration (1.5h)
**What:** Define supported tokens with contract addresses and metadata.
**File:** `packages/nextjs/lib/tokens.ts`

```typescript
export const TOKENS = {
  STRK: {
    symbol: 'STRK',
    name: 'Starknet Token',
    decimals: 18,
    erc20Address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    tongoAddress: '0x0408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed',
    rate: 50000000000000000n,
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    erc20Address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    tongoAddress: '0x02cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5',
    rate: 3000000000000n,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    erc20Address: '0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080',
    tongoAddress: '0x02caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552',
    rate: 10000n,
  },
} as const;
```

### Task 1.3: Tongo Hooks — Balance, Fund, Withdraw, Transfer, Rollover (12h)
**What:** Build all core operation hooks.

**File: `hooks/useTongoBalance.ts`** (2h)
- Read state from `tongoAccount.state()`
- Convert Tongo units to ERC20 display amounts via `tongoToErc20()`
- Poll every 10s or on-demand refresh
- Return `{ balance, pending, nonce, isLoading, refresh }`

**File: `hooks/useTongoFund.ts`** (2.5h)
- Accept token + ERC20 amount
- Convert to Tongo units via `erc20ToTongo()`
- Call `tongoAccount.fund({ amount, sender })`
- Execute `[fundOp.approve!, fundOp.toCalldata()]` via starknet account
- Handle tx states (pending, success, error)
- Refresh balance after success

**File: `hooks/useTongoWithdraw.ts`** (2h)
- Accept token + Tongo amount
- Call `tongoAccount.withdraw({ amount, to: senderAddress, sender })`
- Execute via starknet account
- Handle tx states + refresh

**File: `hooks/useTongoTransfer.ts`** (3h) — **Most critical hook**
- Accept recipient public key (base58 TongoAddress), amount, token
- Convert base58 to affine via `pubKeyBase58ToAffine()`
- Call `tongoAccount.transfer({ amount, to: recipientPubKey, sender })`
- Execute via starknet account
- Store tx metadata (note, privacy level) in localStorage
- Handle tx states + refresh

**File: `hooks/useTongoRollover.ts`** (1h)
- Call `tongoAccount.rollover({ sender })`
- Execute + refresh
- Only enabled when pending > 0

**File: `hooks/useTongoHistory.ts`** (1.5h)
- Call `tongoAccount.getTxHistory(0)`
- Returns sorted events: fund, transfer, withdraw, rollover, ragequit
- Merge with local notes/metadata from localStorage

### Task 1.4: Address Utility (1h)
**File:** `packages/nextjs/lib/address.ts`
```typescript
export function padAddress(address: string): string {
  if (!address.startsWith('0x')) address = '0x' + address;
  return '0x' + address.slice(2).padStart(64, '0');
}
```

### Task 1.5: Wallet Dashboard Page (4h)
**File:** `packages/nextjs/app/wallet/page.tsx`
**Components:**
- `BalanceCard.tsx` — Shows shielded balance (hidden by default, tap to reveal) + public ERC20 balance + pending amount
- `TokenSelector.tsx` — ETH/STRK/USDC tabs
- `FundModal.tsx` — Shield funds flow (amount input + approve + fund)
- `WithdrawModal.tsx` — Unshield funds flow
- Action buttons: Shield, Send, Request

### Task 1.6: End-to-End Fund + Withdraw Test (2.5h)
**What:** Manual test on Sepolia with real wallet:
1. Connect ArgentX/Braavos
2. Fund 0.01 STRK into Tongo pool
3. Verify shielded balance updates
4. Withdraw 0.005 STRK
5. Verify public balance increases

---

## Phase 2 — Social Payment UX (Days 8-13, ~36 hours)

### Task 2.1: Recipient Search + .stark Resolution (5h)
**File:** `components/payment/RecipientSearch.tsx`
**Features:**
- Text input with debounce (300ms)
- Three modes: type .stark name, paste address, select from contacts
- Real-time resolution indicator
- Uses `StarknetIdNavigator.getAddressFromStarkName()`
- Reverse resolves pasted addresses via `getStarkName()`
- **Critical:** After resolving to address, need to look up recipient's Tongo public key. Options:
  a) Recipient shares their base58 TongoAddress directly
  b) Build a simple mapping registry (address → TongoAddress)
  c) Derive from address (NOT possible — separate keys)

**Decision for MVP:** Recipients share their TongoAddress (base58). The search input accepts both .stark names and TongoAddresses. For the demo, pre-register both test wallets' TongoAddresses in the contacts list.

### Task 2.2: Amount Input Component (2.5h)
**File:** `components/payment/AmountInput.tsx`
- Large number display
- Numpad (mobile-friendly)
- Token selector
- Show max available (shielded balance)
- Quick buttons: MAX, 50%, 25%
- Real-time ERC20 ↔ Tongo unit conversion display

### Task 2.3: Payment Note + Emoji (3h)
**Files:**
- `components/payment/PaymentNote.tsx`
- `components/common/EmojiPicker.tsx`
**Features:**
- Text input (max 100 chars)
- Emoji picker (using @emoji-mart/react)
- Quick emoji suggestions: pizza, beer, music, house, car, gift, party
- Privacy level selector: Shielded Public / Friends / Private

### Task 2.4: Complete Send Flow (6h)
**File:** `app/send/page.tsx`
**4-step flow:**
1. Select recipient (RecipientSearch)
2. Enter amount (AmountInput)
3. Add note + privacy level (PaymentNote)
4. Confirm & success animation

**Implementation:**
- Step state machine with back/forward navigation
- On confirm: call `useTongoTransfer.transfer()`
- Store `{ txHash, recipient, recipientName, note, privacyLevel, timestamp, type }` in localStorage
- Success animation: shield icon with checkmark

### Task 2.5: Social Transaction Feed (6h)
**Files:**
- `components/feed/TransactionFeed.tsx`
- `components/feed/FeedItem.tsx`
- `components/feed/PrivacyBadge.tsx`
- `hooks/useTransactionHistory.ts`

**Data model:**
```typescript
interface SocialTransaction {
  txHash: string;
  type: 'send' | 'receive' | 'fund' | 'withdraw' | 'rollover';
  counterparty?: string;         // TongoAddress or Starknet address
  counterpartyName?: string;     // .stark name
  note?: string;
  privacyLevel: 'shielded-public' | 'friends' | 'private';
  timestamp: number;
  status: 'pending' | 'confirmed';
  // Amount is NEVER in the feed
}
```

**Data sources:**
1. Local storage (has notes, privacy levels)
2. On-chain events from `account.getTxHistory()` (has tx hashes, amounts, counterparties)
3. Merge by txHash, local data enriches on-chain data

**Feed item shows:** avatar + .stark name + note + timestamp + privacy badge. NEVER shows amounts.

### Task 2.6: Contact Management (4h)
**Files:**
- `app/contacts/page.tsx`
- `components/contacts/ContactList.tsx`
- `components/contacts/ContactCard.tsx`
- `hooks/useContacts.ts`

**Contact model:**
```typescript
interface Contact {
  starknetAddress: string;
  tongoAddress: string;       // base58 — REQUIRED for transfers
  starkName?: string;
  nickname?: string;
  profilePicture?: string;
  lastInteraction?: number;
  isFavorite: boolean;
}
```

- CRUD in localStorage
- Auto-enrich with Starknet ID profile data
- Sort by favorites, then recency

### Task 2.7: Payment Request System (4h)
**Files:**
- `app/request/page.tsx`
- `hooks/usePaymentRequests.ts`

**Flow:** Create request → generate shareable link/QR → recipient opens → pre-filled send form → confirm.
**MVP:** localStorage-based. For demo, use two browser windows.

**Request model:**
```typescript
interface PaymentRequest {
  id: string;
  requester: string;
  requesterTongoAddress: string;
  requestedFrom: string;
  amount: bigint;
  token: string;
  note: string;
  status: 'pending' | 'paid' | 'declined';
  createdAt: number;
}
```

### Task 2.8: Bill Split Feature (3h)
**File:** `components/payment/SplitBill.tsx`
- Total amount input
- Add people from contacts
- Even split calculation
- Creates multiple payment requests
- Each person can pay their share individually

### Task 2.9: Local Storage Abstraction (2.5h)
**File:** `lib/storage.ts`
- Type-safe localStorage wrapper
- Namespaced keys to avoid conflicts
- Stores: contacts, transaction notes, payment requests, tongo private key
- Export/import for backup

---

## Phase 3 — Polish & Submission (Days 14-19, ~28 hours)

### Task 3.1: UI/Theme Design System (5h)
**Approach:** Leverage Scaffold-Stark's built-in DaisyUI + Tailwind, customize theme.

**Theme:**
- Dark mode primary (privacy = dark aesthetic)
- Accent: electric blue (#3B82F6) for shield icon
- Secondary: purple (#8B5CF6) for privacy elements
- Success: green (#10B981)
- Background: near-black (#0F172A)

**Key UI patterns:**
- Bottom navigation (5 tabs): Home, Send, Activity, Wallet, Settings
- Card-based layout
- Mobile-first (375px target)
- Shield icon animation (CSS pulse)
- Success confetti (framer-motion or CSS keyframes)

**Brand:** "ShieldPay" — tagline: "Social payments, cryptographically private"

### Task 3.2: Layout Components (3h)
**Files:**
- `components/layout/Header.tsx` — Logo + balance pill + notifications
- `components/layout/BottomNav.tsx` — Mobile tab bar
- `components/layout/ConnectWallet.tsx` — Wallet connection modal
- Update `app/layout.tsx` to wrap with both StarknetProvider and TongoProvider

### Task 3.3: Landing/Home Page (2h)
**File:** `app/page.tsx`
- If not connected: show hero + connect wallet CTA
- If connected: show social feed (TransactionFeed)
- Quick action buttons: Send, Request

### Task 3.4: Settings Page (2h)
**File:** `app/settings/page.tsx`
- Show/copy Tongo public key (base58)
- Backup Tongo private key (with warning)
- Default privacy level setting
- Token preference
- Clear local data
- App version / about

### Task 3.5: Optional PaymentRegistry Contract (3h)
**File:** `packages/snfoundry/contracts/src/PaymentRegistry.cairo`
- Simple on-chain registry for note hashes + privacy levels
- Maps tx_hash → (note_hash, privacy_level, timestamp)
- Deploy to Sepolia
- Integrate with frontend (write on send, read on feed)

### Task 3.6: End-to-End Testing on Sepolia (4h)
**Test with two wallets:**
1. Connect wallet A (ArgentX)
2. Fund 0.05 STRK into Tongo
3. Connect wallet B (Braavos) in incognito
4. Fund 0.05 STRK into Tongo
5. Transfer from A → B (add note + emoji)
6. Switch to B — see pending, rollover
7. Check feed on both sides
8. Withdraw from B
9. Test payment request flow
10. Test error cases (insufficient balance, invalid address)

### Task 3.7: Deploy to Vercel (2h)
- Connect GitHub repo
- Set environment variables
- Verify all features work on deployed version
- Get public URL

### Task 3.8: README + Screenshots (3h)
- Architecture diagram
- Feature screenshots
- Setup instructions
- Tech stack description
- Demo video link

### Task 3.9: Demo Video (4h)
- Screen recording with Loom/OBS
- 3-minute max
- Script: Hook → Problem → Solution → Live Demo → Architecture → Vision
- Upload to YouTube (unlisted) or Loom

---

## Critical Path & Dependencies

```
Task 0.1 → 0.2 → 0.3 (must validate SDK works before anything else)
     ↓
Task 1.1 (key management) → 1.3 (hooks) → 1.5 (wallet page)
     ↓
Task 1.6 (E2E test fund/withdraw) ← GATE: must pass before Phase 2
     ↓
Tasks 2.1-2.3 (can be parallel: search, amount input, notes)
     ↓
Task 2.4 (send flow, depends on 2.1-2.3 + 1.3)
     ↓
Tasks 2.5-2.8 (can be partly parallel)
     ↓
Phase 3 (polish, test, deploy, video)
```

## Risk Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK bundling issues | High | Test immediately in Task 0.2; use Vite config workarounds from privacy-toolkit |
| Tongo key UX confusion | Medium | Clear onboarding flow, backup prompt, explain in settings |
| Recipient key discovery | Medium | For MVP, require sharing TongoAddress directly; future: build registry |
| starknet.js version mismatch | High | Pin exact version; use `as any` casts as documented |
| Proof generation slow | Medium | Show loading spinner during ZK proof generation; SDK handles it |
| Rate conversion bugs | Medium | Always use SDK's erc20ToTongo/tongoToErc20; never manual math |

## Estimated Total: ~104 hours across 19 days (5.5h/day average)

---

## Phase 4 — SDK + Chrome Extension (Added Feb 12, 2026)

### Task 4.1: @cloak/sdk Package ✅
**Path:** `packages/sdk/`
- Extracted common logic from web app hooks into reusable TypeScript library
- `CloakClient`: wallet management (create/import/deploy), Tongo account factory
- `CloakAccount`: per-token shielded operations (fund/transfer/withdraw/rollover)
- `StorageAdapter` interface + `MemoryStorage` + `LocalStorageAdapter`
- Dual CJS/ESM output via tsup, 28 unit tests passing
- Token registry, address utilities, key generation adapted from nextjs lib/

### Task 4.2: Chrome Extension ✅
**Path:** `packages/extension/`
- Manifest V3 Chrome extension with Vite + React 18 + Tailwind CSS
- Full standalone wallet — manages its own Starknet keypair (no ArgentX dependency)
- Background service worker wraps `@cloak/sdk` with `ExtensionStorageAdapter` (chrome.storage.local)
- Screens: Onboarding, Deploy, Main Dashboard, Shield, Send, Unshield, Receive, Settings
- Message-passing architecture: popup → background → SDK → Starknet RPC
- Token selector (STRK/ETH/USDC), dual balance display (shielded + public)

### Task 4.3: Monorepo Integration ✅
- Root package.json updated with workspaces for `packages/sdk` and `packages/extension`
- Root scripts: `sdk:build`, `sdk:test`, `extension:build`, `extension:dev`
- README updated with SDK usage examples and extension installation instructions

---

## Phase 5 — Production-Grade Account Lifecycle & 2FA Consistency (Feb 14, 2026) ✅

### Task 5.1: Mobile Deploy Flow ✅

**Problem**: `createWallet` computed a counterfactual CloakAccount address but never deployed it on-chain. Users had an address they couldn't use.

**Changes**:

- **`packages/mobile/src/lib/keys.ts`** — Persist `starkPublicKey` in AsyncStorage (needed for deploy constructor calldata). Added fallback derivation via `ec.starkCurve.getStarkKey()` for backwards compatibility.
- **`packages/mobile/src/lib/WalletContext.tsx`** — Added `isDeployed`, `isCheckingDeployment` state, `checkDeployment()` (uses `getNonceForAddress`), `deployAccount()` (calls `account.deployAccount()` with CloakAccount class hash). Auto-checks deployment when wallet keys load.
- **`packages/mobile/src/screens/DeployScreen.tsx`** (**NEW**) — Full-screen gated view with QR code, address display, Sepolia faucet link, Deploy button with spinner, success card with Voyager link.
- **`packages/mobile/src/navigation/AppNavigator.tsx`** — Gates tab navigator behind deployment check: if `wallet.isWalletCreated && !wallet.isDeployed`, renders DeployScreen instead.

### Task 5.2: Fix 2FA On-Chain Consistency ✅

**Problem**: `enable2FA` silently caught on-chain `set_secondary_key` failures and marked 2FA as "Active" in Supabase/UI. `disable2FA` could delete local key material while the contract still enforced dual-sig.

**Changes**:

- **`packages/mobile/src/lib/TwoFactorContext.tsx`** — Rewrote `enable2FA`: gates behind `wallet.isDeployed`, on-chain tx MUST succeed before Supabase update, cleans up secondary key on any failure. Rewrote `disable2FA`: on-chain `remove_secondary_key` must succeed before Supabase delete — aborts entirely on failure, preserving key material.
- **`packages/mobile/src/screens/SettingsScreen.tsx`** — Reordered stepper from `["auth", "keygen", "register", "onchain"]` to `["auth", "keygen", "onchain", "register"]`. Added deployment gate: disabled Enable 2FA button with message when account not deployed.

### Task 5.3: Bug Fixes (Feb 14, 2026) ✅

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Address validation always fails | `useTongoBridge` doesn't expose raw `send()` method | Added `validateBase58()` to `useTongoBridge.ts`, updated `WalletContext.tsx` |
| Pasted address truncated in input | Single-line TextInput only shows tail | Made input `multiline` with `numberOfLines={2}`, added paste button |
| iOS excessive top gap | Uniform `spacing.lg` padding on iOS where Dynamic Island already creates space | Platform-specific `paddingTop: Platform.OS === "ios" ? spacing.sm : spacing.lg` |
| Extension two countdowns | `two-factor.ts` status string had countdown AND `TwoFactorWaiting.tsx` had its own timer | Removed countdown from status string in `two-factor.ts` |
| Claim banner persists after rollover | `refreshBalance()` not awaited after rollover | `await wallet.refreshBalance()` in `handleClaim` and on success dismiss |

### Files Modified (Phase 5)

| File | Change |
|------|--------|
| `packages/mobile/src/lib/keys.ts` | Persist `starkPublicKey` in AsyncStorage |
| `packages/mobile/src/lib/WalletContext.tsx` | Add deploy state/functions, fix `validateAddress` |
| `packages/mobile/src/screens/DeployScreen.tsx` | **NEW** — deploy gate screen |
| `packages/mobile/src/navigation/AppNavigator.tsx` | Gate behind deployment check |
| `packages/mobile/src/lib/TwoFactorContext.tsx` | Fix enable/disable 2FA ordering |
| `packages/mobile/src/screens/SettingsScreen.tsx` | Update stepper, deployment gate |
| `packages/mobile/src/bridge/useTongoBridge.ts` | Add `validateBase58()` method |
| `packages/mobile/src/screens/SendScreen.tsx` | Multiline address input + paste button |
| `packages/mobile/src/screens/HomeScreen.tsx` | iOS padding fix, claim banner fix |
| `packages/extension/src/shared/two-factor.ts` | Remove duplicate countdown from status |

---

## Phase 6 — Security Audit + DRY Consolidation (Feb 14, 2026) ✅

Security audit found hardcoded secrets in 15+ source files and DRY analysis found ~800 lines of duplicated code across the three frontends. Consolidated everything to use SDK as single source of truth.

### Task 6.1: SDK Centralized Config ✅
- **`packages/sdk/src/config.ts`** (**NEW**) — Single source of truth for `DEFAULT_RPC`, `CLOAK_WARD_CLASS_HASH`, `STRK_ADDRESS`, `DEFAULT_SUPABASE_URL`, `DEFAULT_SUPABASE_KEY`
- **`packages/sdk/src/client.ts`** — Replaced local `DEFAULT_RPC` with import from `config.ts`
- **`packages/sdk/src/two-factor.ts`** — Added `request2FAApproval()` (insert + poll pattern extracted from web/extension)
- **`packages/sdk/src/index.ts`** — Added 8 new exports: `DEFAULT_RPC`, `CLOAK_WARD_CLASS_HASH`, `STRK_ADDRESS`, `DEFAULT_SUPABASE_URL`, `DEFAULT_SUPABASE_KEY`, `request2FAApproval`, `TwoFAApprovalParams`, `TwoFAApprovalResult`
- **Version bumped** to `0.2.0`

### Task 6.2: Test Script Security ✅
- **`packages/sdk/.env.example`** (**NEW**) — Template with `FUNDER_PK`, `GUARDIAN_PK`, `RPC_URL`, `SUPABASE_URL`, etc.
- **8 test scripts updated** — All hardcoded private keys, Supabase creds, and addresses replaced with `process.env.*` + fail-fast validation
- **`dotenv`** added as devDependency

| Script | Secrets Removed |
|--------|----------------|
| `e2e-test.cjs` | FUNDER_PK, FUNDER_ADDRESS |
| `e2e-full-flow.cjs` | FUNDER_PK, FUNDER_ADDRESS, SUPABASE_URL, SUPABASE_KEY |
| `deploy-cloak-account.cjs` | FUNDER_PK, FUNDER_ADDRESS |
| `deploy-ward.cjs` | GUARDIAN_PK, GUARDIAN_ADDRESS |
| `declare-cloak-ward.cjs` | FUNDER_PK, FUNDER_ADDRESS |
| `test-ward-setup.cjs` | GUARDIAN_PK, GUARDIAN_ADDRESS, SUPABASE_URL, SUPABASE_KEY |
| `test-ward-approval.cjs` | WARD_ADDRESS, GUARDIAN_ADDRESS, SUPABASE_URL, SUPABASE_KEY |
| `scripts/e2e-cloak-account.mjs` | FUNDER_PK, FUNDER_ADDRESS |

### Task 6.3: Mobile Consolidation ✅
- **`packages/mobile/src/lib/twoFactor.ts`** — Removed `normalizeAddress()`, `signTransactionHash()`, `combinedSignature()`, `deserializeCalls()`, local `SupabaseLite` class (~150 lines). All replaced with SDK imports.
- **`packages/mobile/src/lib/wardContext.tsx`** — Removed `RPC_URL`, `CLOAK_WARD_CLASS_HASH`, `STRK_ADDRESS`, local `WardInfo`/`WardApprovalRequest` types. All replaced with SDK imports.
- **4 additional files** — Replaced `RPC_URL` with `DEFAULT_RPC.sepolia` in `WalletContext.tsx`, `TwoFactorContext.tsx`, `ApprovalModal.tsx`, `useDualSigExecutor.ts`. Also replaced `CLOAK_ACCOUNT_CLASS_HASH` in `WalletContext.tsx`.

### Task 6.4: Extension Consolidation ✅
- **`packages/extension/src/shared/supabase-config.ts`** — Deleted local `SupabaseLite` class (~90 lines), replaced with SDK import. Updated `getSupabaseLite()` to return SDK's `SupabaseLite`.
- **`packages/extension/src/shared/two-factor.ts`** — Removed `normalizeAddress()`, `RPC_URL`, `request2FAApproval()` (~115 lines). Replaced with SDK imports + thin wrapper.
- **`packages/extension/src/popup/hooks/useWard.ts`** — Removed `RPC_URL`, local `WardInfo`, 7 parallel RPC calls (~35 lines). Replaced with `checkIfWardAccount()` and `fetchWardInfo()` from SDK.
- **`packages/extension/src/shared/ward-approval.ts`** — Replaced `RPC_URL` with `DEFAULT_RPC.sepolia`.

### Task 6.5: Next.js Consolidation ✅
- **`packages/nextjs/lib/two-factor.ts`** — Removed local `SupabaseLite` class, `normalizeAddress()`, `request2FAApproval()` (~175 lines). Replaced with SDK imports + wrappers.
- **`packages/nextjs/hooks/useWard.ts`** — Removed `RPC_URL`, local `WardInfo`, `normalizeAddress()`, 7 parallel RPC calls (~40 lines). Replaced with SDK functions.
- **`packages/nextjs/lib/ward-approval.ts`** — Replaced `RPC_URL` with `DEFAULT_RPC.sepolia`.

### Task 6.6: Workspace Alignment ✅
- **`package.json`** (root) — Added `packages/mobile` to workspaces
- **`packages/mobile/package.json`** — Changed SDK dep to `workspace:*`
- **`packages/extension/package.json`** — Changed SDK dep to `workspace:*`
- **`packages/nextjs/package.json`** — Changed SDK dep to `workspace:*`

### Results

| Metric | Before | After |
|--------|--------|-------|
| Hardcoded Alchemy RPC URL | 12 locations | 1 (SDK config.ts) |
| Hardcoded Supabase creds | 6 locations | 1 (SDK config.ts) |
| Hardcoded private keys | 8 scripts | 0 (all .env) |
| Local SupabaseLite classes | 3 frontends | 0 (use SDK) |
| normalizeAddress() copies | 5 | 1 (SDK) |
| Ward on-chain read duplication | 3 copies | 1 (SDK) |
| 2FA polling duplication | 2 copies | 1 (SDK) |
| **Total lines removed** | — | **~615** |
| **Total lines added to SDK** | — | **~120** |

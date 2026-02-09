# Social Shielded Payments - Research Summary

## 1. Tongo SDK (@fatsolutions/tongo-sdk v1.3.1)

### Key Architecture Decisions
- **Separate keypair**: Tongo uses its OWN private key (Stark curve scalar), NOT the Starknet wallet key. The wallet is only used to sign/pay for transactions.
- **No epoch system**: Unlike the original Zether paper, Tongo has NO timing constraints. Rollover is on-demand whenever pending > 0.
- **One contract per token**: Each ERC20 has a separate Tongo contract deployment.
- **Balance max**: 2^32 Tongo units (bit_size=32). For USDC (rate=10000), that's ~42,949 USDC max per account.
- **Rate system**: `fund(amount)` deposits `amount * rate` ERC20 base units. E.g., STRK rate=50000000000000000, so 1 Tongo unit = 0.05 STRK.

### Constructor
```typescript
import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
const account = new TongoAccount(
    tongoPrivateKey,      // bigint | Uint8Array | hex string
    tongoContractAddress, // string (must be padded to 0x + 64 hex chars)
    rpcProvider           // starknet.js RpcProvider
);
```

### Core Operations
- `account.fund({ amount, sender })` → FundOperation (has `.approve` and `.toCalldata()`)
- `account.transfer({ amount, to: PubKey, sender })` → TransferOperation
- `account.withdraw({ amount, to, sender })` → WithdrawOperation
- `account.rollover({ sender })` → RollOverOperation
- `account.ragequit({ to, sender })` → RagequitOperation
- `account.state()` → `{ balance, pending, nonce }`
- `account.rate()` → bigint
- `account.erc20ToTongo(amount)` / `account.tongoToErc20(amount)`
- `account.getTxHistory(initialBlock)` → sorted events array
- `account.tongoAddress()` → base58 TongoAddress

### Execution Pattern
```typescript
const fundOp = await account.fund({ amount: 100n, sender: signerAddress });
const tx = await signer.execute([fundOp.approve!, fundOp.toCalldata()]);
```

### Sepolia Contract Addresses
| Token | ERC20 | Tongo Contract | Rate |
|-------|-------|----------------|------|
| STRK | 0x4718f5a...938d | 0x408163b...6ed | 50000000000000000 |
| ETH | 0x49d3657...4dc7 | 0x2cf0dc1...ef5 | 3000000000000 |
| USDC | 0x53b40a6...080 | 0x2caae36...552 | 10000 |

### Key Utility Functions
- `pubKeyBase58ToAffine(base58String)` → `{ x: bigint, y: bigint }`
- `pubKeyAffineToBase58(pubKey)` → TongoAddress
- `derivePublicKey(privateKey)` → PubKey

### Known Gotchas
1. Addresses must be padded to 66 chars (0x + 64 hex) for ZK proofs
2. Type mismatch with starknet.js — cast provider `as any`
3. `pubKeyBase58ToAffine` may need import from `dist/types.js` subfolder
4. SDK generates ALL ZK proofs internally — no manual proof work needed

---

## 2. starknet-privacy-toolkit Patterns

### TongoService Architecture
- Uses `TongoService` class wrapping `TongoAccount`
- Client facade: `createTongoClient({ network, walletAccount, provider, tongoPrivateKey })`
- Key stored in `localStorage` under `'tongo_private_key'`
- Key validation: must be 1n <= key < starkCurveOrder

### Critical Workarounds
- Address padding helper needed for all addresses
- `.approve` from FundOperation may need calldata patching
- Use `as any` cast for provider due to bundled starknet.js types

### RPC Endpoints Used
- Sepolia: `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/`
- Alternative Sepolia: `https://sepolia.starknet.io/rpc/v0_8_1`

---

## 3. Scaffold-Stark 2

### Prerequisites
- Node.js >= v22, Yarn, Scarb v2.15.1, Snforge v0.55.0
- Install via: `npx create-stark@latest`

### Key Files
- `packages/nextjs/scaffold.config.ts` — central config (targetNetworks, pollingInterval)
- `packages/nextjs/app/layout.tsx` — provider chain setup
- `packages/snfoundry/scripts-ts/deploy.ts` — deployment script

### Built-in Hooks (keep & use)
- `useScaffoldReadContract`, `useScaffoldWriteContract`, `useScaffoldMultiWriteContract`
- `useScaffoldEventHistory`, `useScaffoldWatchContractEvent`
- `useDeployedContractInfo`, `useScaffoldStarkProfile`

### Configuration for Sepolia
```typescript
// scaffold.config.ts
targetNetworks: [chains.sepolia]
```
```bash
# packages/nextjs/.env
NEXT_PUBLIC_SEPOLIA_PROVIDER_URL=https://starknet-sepolia.g.alchemy.com/...
```
```bash
# packages/snfoundry/.env
PRIVATE_KEY_SEPOLIA=0x...
RPC_URL_SEPOLIA=https://starknet-sepolia.g.alchemy.com/...
ACCOUNT_ADDRESS_SEPOLIA=0x...
```

### Styling: Tailwind CSS + DaisyUI, dark/light theme built-in

---

## 4. starknetid.js (v5.0.0)

### Initialization
```typescript
import { StarknetIdNavigator } from "starknetid.js";
const navigator = new StarknetIdNavigator(provider, constants.StarknetChainId.SN_SEPOLIA);
```

### Key Methods
- `navigator.getAddressFromStarkName("alice.stark")` → hex address
- `navigator.getStarkName("0x...")` → "alice.stark"
- `navigator.getStarkNames(addresses[])` → batch resolve
- `navigator.getProfileData(address)` → `{ name, profilePicture, twitter, github, discord, proofOfPersonhood }`
- `navigator.getStarkProfiles(addresses[])` → batch profiles

### React Hooks (from @starknet-react/core)
- `useStarkName({ address })` → `.data` = "name.stark"
- `useAddressFromStarkName({ name })` → `.data` = "0x..."
- `useStarkProfile({ address })` → `.data` = StarkProfile

### Error Handling
- Invalid domain → throws "Invalid domain"
- Not found → throws "Could not get address/stark name"
- Batch methods return empty strings/undefined instead of throwing

---

## 5. Re{define} Hackathon

### Deadline: February 28, 2026, 23:59 UTC
### Required Deliverables
1. GitHub repository (public)
2. Demo video (max 3 minutes)
3. Live Starknet deployment

### Privacy Track: $9,675 USD in STRK
- Judged on: **impact** and **technical depth**

### Fat Solutions Bounty: $1,000 ($500 x 2 winners)
- Focus: privacy and identity projects
- Tongo SDK usage strongly implied

### Communication: Telegram t.me/+-5zNW47GSdQ1ZDkx

---

## 6. starknet-react Patterns

### Provider Setup (Sepolia)
```tsx
import { sepolia } from "@starknet-react/chains";
import { StarknetConfig, jsonRpcProvider, voyager } from "@starknet-react/core";
import { InjectedConnector } from "starknetkit/injected";

const connectors = [
  new InjectedConnector({ options: { id: "argentX" } }),
  new InjectedConnector({ options: { id: "braavos" } }),
];

<StarknetConfig
  chains={[sepolia]}
  provider={jsonRpcProvider({ rpc: () => ({ nodeUrl: RPC_URL }) })}
  connectors={connectors}
  explorer={voyager}
/>
```

### Key Hooks
- `useAccount()` → `{ address, isConnected, account }`
- `useConnect()` → `{ connect, connectors }`
- `useDisconnect()` → `{ disconnect }`
- `useBalance({ address, token? })` → `{ value, decimals, symbol, formatted }`
- `useReadContract({ abi, address, functionName, args })` → typed read
- `useSendTransaction({ calls })` → `{ send, sendAsync, data, isPending, isSuccess }`
- `useContract({ abi, address })` → typed contract instance

### Multicall Pattern
```tsx
const calls = [
  contract.populate("approve", [spender, amount]),
  contract.populate("transfer", [recipient, amount]),
];
const { send } = useSendTransaction({ calls });
```

### Important: starknet.js peer dependency is v8.5.x (must match Tongo SDK's requirement)

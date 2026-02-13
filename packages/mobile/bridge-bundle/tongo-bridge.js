/**
 * Tongo SDK Bridge — Runs inside a WebView.
 *
 * Receives commands from React Native via postMessage,
 * executes Tongo SDK operations, and returns results.
 */
import { Account as TongoAccount, derivePublicKey, pubKeyAffineToBase58, pubKeyBase58ToAffine } from "@fatsolutions/tongo-sdk";
import { RpcProvider, Account, CallData, stark, ec } from "starknet";

// Tongo contract addresses on Sepolia
const TONGO_CONTRACTS = {
  STRK: "0x0408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed",
  ETH: "0x02cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5",
  USDC: "0x02caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552",
};

// ERC20 contract addresses on Sepolia
const ERC20_CONTRACTS = {
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  USDC: "0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080",
};

// Pad address to 66 chars (0x + 64 hex)
function padAddress(addr) {
  if (!addr) return addr;
  const clean = addr.replace(/^0x/i, "");
  return "0x" + clean.padStart(64, "0");
}

// Check crypto.subtle availability (requires secure context)
if (typeof crypto === "undefined" || !crypto.subtle) {
  const msg = "[Bridge] WARNING: crypto.subtle unavailable (non-secure context). Cryptographic operations will fail.";
  console.warn(msg);
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "bridge-error", error: msg }));
  }
}

let provider = null;
let tongoAccount = null;
let starkAccount = null;

// Fetch fresh nonce from network to avoid stale/cached nonce errors
async function freshNonce() {
  return await provider.getNonceForAddress(starkAccount.address);
}

// Initialize provider
function initProvider(rpcUrl) {
  provider = new RpcProvider({ nodeUrl: rpcUrl });
  return true;
}

// Initialize Tongo account
function initTongoAccount(tongoPrivateKey, token = "STRK") {
  if (!provider) throw new Error("Provider not initialized");
  const contractAddress = padAddress(TONGO_CONTRACTS[token]);
  if (!contractAddress) throw new Error(`Unknown token: ${token}`);
  tongoAccount = new TongoAccount(tongoPrivateKey, contractAddress, provider);
  return true;
}

// Initialize Starknet signing account
function initStarkAccount(address, privateKey) {
  if (!provider) throw new Error("Provider not initialized");
  starkAccount = new Account({ provider, address: padAddress(address), signer: privateKey });
  return true;
}

// Serialize a call object (convert BigInt calldata to strings)
function serializeCall(call) {
  return {
    contractAddress: call.contractAddress,
    entrypoint: call.entrypoint,
    calldata: (call.calldata || []).map(d => d.toString()),
  };
}

// Command handlers
const handlers = {
  // System
  ping: async () => "pong",

  // Initialize
  init: async ({ rpcUrl, tongoPrivateKey, token, starkAddress, starkPrivateKey }) => {
    initProvider(rpcUrl);
    initTongoAccount(tongoPrivateKey, token || "STRK");
    if (starkAddress && starkPrivateKey) {
      initStarkAccount(starkAddress, starkPrivateKey);
    }
    return { success: true };
  },

  // Switch token
  switchToken: async ({ tongoPrivateKey, token }) => {
    initTongoAccount(tongoPrivateKey, token);
    return { success: true };
  },

  // Key operations
  derivePublicKey: async ({ privateKey }) => {
    const pk = typeof privateKey === "string" ? BigInt(privateKey) : privateKey;
    const pubKey = derivePublicKey(pk);
    return { x: pubKey.x.toString(), y: pubKey.y.toString() };
  },

  getTongoAddress: async () => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const addr = tongoAccount.tongoAddress();
    return addr;
  },

  pubKeyToBase58: async ({ x, y }) => {
    return pubKeyAffineToBase58({ x: BigInt(x), y: BigInt(y) });
  },

  base58ToPubKey: async ({ base58 }) => {
    const pk = pubKeyBase58ToAffine(base58);
    return { x: pk.x.toString(), y: pk.y.toString() };
  },

  // State queries
  getState: async () => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const state = await tongoAccount.state();
    return {
      balance: state.balance.toString(),
      pending: state.pending.toString(),
      nonce: state.nonce.toString(),
    };
  },

  getRate: async () => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const rate = await tongoAccount.rate();
    return rate.toString();
  },

  erc20ToTongo: async ({ amount }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const result = await tongoAccount.erc20ToTongo(BigInt(amount));
    return result.toString();
  },

  tongoToErc20: async ({ amount }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const result = await tongoAccount.tongoToErc20(BigInt(amount));
    return result.toString();
  },

  // Fund (shield)
  fund: async ({ amount, sender }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    if (!starkAccount) throw new Error("Stark account not initialized");
    const fundOp = await tongoAccount.fund({
      amount: BigInt(amount),
      sender: padAddress(sender),
    });
    const calls = [];
    if (fundOp.approve) calls.push(fundOp.approve);
    calls.push(fundOp.toCalldata());
    const nonce = await freshNonce();
    const tx = await starkAccount.execute(calls, { nonce });
    return { txHash: tx.transaction_hash };
  },

  // Transfer (shielded)
  transfer: async ({ amount, recipientBase58, sender }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    if (!starkAccount) throw new Error("Stark account not initialized");
    const recipientPubKey = pubKeyBase58ToAffine(recipientBase58);
    const transferOp = await tongoAccount.transfer({
      amount: BigInt(amount),
      to: recipientPubKey,
      sender: padAddress(sender),
    });
    const nonce = await freshNonce();
    const tx = await starkAccount.execute([transferOp.toCalldata()], { nonce });
    return { txHash: tx.transaction_hash };
  },

  // Withdraw (unshield)
  withdraw: async ({ amount, to, sender }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    if (!starkAccount) throw new Error("Stark account not initialized");
    const withdrawOp = await tongoAccount.withdraw({
      amount: BigInt(amount),
      to: padAddress(to),
      sender: padAddress(sender),
    });
    const nonce = await freshNonce();
    const tx = await starkAccount.execute([withdrawOp.toCalldata()], { nonce });
    return { txHash: tx.transaction_hash };
  },

  // Rollover (claim pending)
  rollover: async ({ sender }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    if (!starkAccount) throw new Error("Stark account not initialized");
    const rolloverOp = await tongoAccount.rollover({
      sender: padAddress(sender),
    });
    const nonce = await freshNonce();
    const tx = await starkAccount.execute([rolloverOp.toCalldata()], { nonce });
    return { txHash: tx.transaction_hash };
  },

  // ─── Prepare commands (return calls without signing/executing) ──────

  prepareFund: async ({ amount, sender }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const fundOp = await tongoAccount.fund({
      amount: BigInt(amount),
      sender: padAddress(sender),
    });
    const calls = [];
    if (fundOp.approve) calls.push(serializeCall(fundOp.approve));
    calls.push(serializeCall(fundOp.toCalldata()));
    return { calls };
  },

  prepareTransfer: async ({ amount, recipientBase58, sender }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const recipientPubKey = pubKeyBase58ToAffine(recipientBase58);
    const transferOp = await tongoAccount.transfer({
      amount: BigInt(amount),
      to: recipientPubKey,
      sender: padAddress(sender),
    });
    return { calls: [serializeCall(transferOp.toCalldata())] };
  },

  prepareWithdraw: async ({ amount, to, sender }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const withdrawOp = await tongoAccount.withdraw({
      amount: BigInt(amount),
      to: padAddress(to),
      sender: padAddress(sender),
    });
    return { calls: [serializeCall(withdrawOp.toCalldata())] };
  },

  prepareRollover: async ({ sender }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const rolloverOp = await tongoAccount.rollover({
      sender: padAddress(sender),
    });
    return { calls: [serializeCall(rolloverOp.toCalldata())] };
  },

  // Transaction history
  getTxHistory: async ({ fromBlock = 0 }) => {
    if (!tongoAccount) throw new Error("Tongo account not initialized");
    const history = await tongoAccount.getTxHistory(fromBlock);
    return history.map(event => ({
      ...event,
      amount: event.amount?.toString(),
      nonce: event.nonce?.toString(),
    }));
  },

  // Query ERC20 balance
  queryERC20Balance: async ({ token, address }) => {
    if (!provider) throw new Error("Provider not initialized");
    const contractAddress = ERC20_CONTRACTS[token];
    if (!contractAddress) throw new Error(`Unknown token: ${token}`);
    const result = await provider.callContract({
      contractAddress: padAddress(contractAddress),
      entrypoint: "balanceOf",
      calldata: [padAddress(address)],
    });
    // balanceOf returns u256 as [low, high]
    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0");
    const balance = low + (high << 128n);
    return balance.toString();
  },

  // Generate new keypair (for account creation)
  generateKeypair: async () => {
    const privateKey = stark.randomAddress();
    const publicKey = ec.starkCurve.getStarkKey(privateKey);
    return { privateKey, publicKey };
  },
};

// Message handler — listens for commands from React Native
window.addEventListener("message", async (event) => {
  let data;
  try {
    data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }

  const { id, command, params } = data;
  if (!id || !command) return;

  try {
    const handler = handlers[command];
    if (!handler) throw new Error(`Unknown command: ${command}`);
    const result = await handler(params || {});
    window.ReactNativeWebView.postMessage(JSON.stringify({ id, result }));
  } catch (error) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ id, error: error.message || String(error), stack: error.stack })
    );
  }
});

// Signal that the bridge is ready
window.ReactNativeWebView.postMessage(JSON.stringify({ type: "bridge-ready" }));

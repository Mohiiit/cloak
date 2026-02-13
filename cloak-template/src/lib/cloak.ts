/**
 * Thin wrapper around custom cloak_* RPC calls.
 * These methods call the Cloak extension wallet provider
 * for privacy-preserving Starknet operations.
 */

type TokenKey = "STRK" | "ETH" | "USDC";

interface ShieldedState {
  balance: string;
  pending: string;
  nonce: string;
}

interface TxResult {
  transaction_hash: string;
}

function normalizeTxResult(result: any): TxResult {
  return {
    transaction_hash: result.transaction_hash || result.txHash || result,
  };
}

function getCloakProvider() {
  const provider = (window as any).starknet_cloak;
  if (!provider) {
    throw new Error(
      "Cloak Wallet not found. Install the Cloak browser extension.",
    );
  }
  return provider;
}

export async function getShieldedBalance(
  token: TokenKey = "STRK",
): Promise<ShieldedState> {
  const provider = getCloakProvider();
  return provider.request({
    type: "cloak_getShieldedState",
    params: { token },
  });
}

export async function shieldTokens(
  token: TokenKey = "STRK",
  amount: string,
): Promise<TxResult> {
  const provider = getCloakProvider();
  const result = await provider.request({
    type: "cloak_fund",
    params: { token, amount },
  });
  return normalizeTxResult(result);
}

export async function shieldedTransfer(
  to: string,
  token: TokenKey = "STRK",
  amount: string,
): Promise<TxResult> {
  const provider = getCloakProvider();
  const result = await provider.request({
    type: "cloak_transfer",
    params: { token, to, amount },
  });
  return normalizeTxResult(result);
}

export async function unshieldTokens(
  token: TokenKey = "STRK",
  amount: string,
): Promise<TxResult> {
  const provider = getCloakProvider();
  const result = await provider.request({
    type: "cloak_withdraw",
    params: { token, amount },
  });
  return normalizeTxResult(result);
}

export async function claimPending(
  token: TokenKey = "STRK",
): Promise<TxResult> {
  const provider = getCloakProvider();
  const result = await provider.request({
    type: "cloak_rollover",
    params: { token },
  });
  return normalizeTxResult(result);
}

export async function getTongoAddress(): Promise<string> {
  const provider = getCloakProvider();
  return provider.request({ type: "cloak_getTongoAddress" });
}

export function isCloakInstalled(): boolean {
  return typeof window !== "undefined" && !!(window as any).starknet_cloak;
}

export type TokenKey = "STRK" | "ETH" | "USDC";
export type Network = "sepolia" | "mainnet";

export interface TokenConfig {
  symbol: TokenKey;
  name: string;
  decimals: number;
  erc20Address: string;
  tongoContract: string;
  rate: bigint;
}

export interface WalletInfo {
  privateKey: string;
  publicKey: string;
  starkAddress: string;
  tongoAddress: string;
}

export interface ShieldedState {
  balance: bigint;
  pending: bigint;
  nonce: bigint;
}

export interface CloakEvent {
  type: "fund" | "transfer" | "withdraw" | "rollover";
  txHash: string;
  blockNumber: number;
  amount?: bigint;
}

export interface CloakClientConfig {
  network: Network;
  rpcUrl?: string;
  storage?: StorageAdapter;
}

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

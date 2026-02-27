import type { X402TongoProofBundle } from "@cloak-wallet/sdk";

export type BridgeInitParams = {
  tongoPrivateKey: string;
  token?: string;
  starkAddress?: string;
  starkPrivateKey?: string;
};

export type TongoState = {
  balance: string;
  pending: string;
  nonce: string;
};

export type BridgeTxResult = {
  txHash: string;
};

export type BridgePrepareResult = {
  calls: any[];
};

export type BridgeX402PaymentResult = {
  txHash: string;
  tongoProof: X402TongoProofBundle;
};

export type BridgeKeypair = {
  privateKey: string;
  publicKey: string;
};

export type BridgePublicKey = {
  x: string;
  y: string;
};

export interface BridgeClient {
  readonly isReady: boolean;

  initialize(params: BridgeInitParams): Promise<any>;
  getState(): Promise<TongoState>;
  getRate(): Promise<string>;
  getTongoAddress(): Promise<string>;

  fund(amount: string, sender: string): Promise<BridgeTxResult>;
  transfer(
    amount: string,
    recipientBase58: string,
    sender: string,
  ): Promise<BridgeTxResult>;
  withdraw(amount: string, to: string, sender: string): Promise<BridgeTxResult>;
  rollover(sender: string): Promise<BridgeTxResult>;

  prepareFund(amount: string, sender: string): Promise<BridgePrepareResult>;
  prepareTransfer(
    amount: string,
    recipientBase58: string,
    sender: string,
  ): Promise<BridgePrepareResult>;
  prepareWithdraw(
    amount: string,
    to: string,
    sender: string,
  ): Promise<BridgePrepareResult>;
  prepareRollover(sender: string): Promise<BridgePrepareResult>;

  x402Pay(
    amount: string,
    recipient: string,
    sender: string,
    /** Base58 Tongo address for shielded transfer mode. */
    recipientBase58?: string,
  ): Promise<BridgeX402PaymentResult>;

  switchToken(tongoPrivateKey: string, token: string): Promise<any>;
  generateKeypair(): Promise<BridgeKeypair>;
  derivePublicKey(privateKey: string): Promise<BridgePublicKey>;
  queryERC20Balance(token: string, address: string): Promise<string>;
  getTxHistory(fromBlock?: number): Promise<any[]>;
  validateBase58(base58: string): Promise<boolean>;
}

import type {
  BridgeClient,
  BridgeInitParams,
  BridgeKeypair,
  BridgePrepareResult,
  BridgePublicKey,
  BridgeTxResult,
  TongoState,
} from "../interfaces/BridgeClient";
import { loadActiveScenarioFixture } from "../fixtures/loadScenarioFixture";

type BridgeFixture = {
  tongoAddress: string;
  rateByToken: Record<string, string>;
  stateByToken: Record<string, TongoState>;
  erc20BalancesByToken: Record<string, string>;
  txHistory: any[];
  validBase58: string[];
};

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MockBridgeClient implements BridgeClient {
  readonly isReady = true;

  private isInitialized = false;
  private selectedToken = "STRK";
  private txCounter = 0;

  private readonly tongoAddress: string;
  private readonly rateByToken: Record<string, string>;
  private readonly stateByToken: Record<string, TongoState>;
  private readonly erc20BalancesByToken: Record<string, string>;
  private readonly txHistory: any[];
  private readonly validBase58: Set<string>;

  constructor() {
    const bridgeFixture =
      loadActiveScenarioFixture<BridgeFixture>("bridgeClient");
    this.tongoAddress = bridgeFixture.tongoAddress;
    this.rateByToken = clone(bridgeFixture.rateByToken);
    this.stateByToken = clone(bridgeFixture.stateByToken);
    this.erc20BalancesByToken = clone(bridgeFixture.erc20BalancesByToken);
    this.txHistory = clone(bridgeFixture.txHistory);
    this.validBase58 = new Set(bridgeFixture.validBase58);
    this.txCounter = this.txHistory.length;
  }

  async initialize(params: BridgeInitParams): Promise<{ success: boolean }> {
    this.isInitialized = true;
    if (params.token) {
      this.selectedToken = params.token;
    }
    return { success: true };
  }

  async getState(): Promise<TongoState> {
    this.ensureInitialized();
    return clone(this.getTokenState(this.selectedToken));
  }

  async getRate(): Promise<string> {
    this.ensureInitialized();
    return this.rateByToken[this.selectedToken] ?? "1.0000";
  }

  async getTongoAddress(): Promise<string> {
    this.ensureInitialized();
    return this.tongoAddress;
  }

  async fund(amount: string, sender: string): Promise<BridgeTxResult> {
    this.ensureInitialized();
    const txHash = this.pushTx("fund", amount, { sender });
    return { txHash };
  }

  async transfer(
    amount: string,
    recipientBase58: string,
    sender: string,
  ): Promise<BridgeTxResult> {
    this.ensureInitialized();
    const txHash = this.pushTx("transfer", amount, {
      sender,
      recipientBase58,
    });
    return { txHash };
  }

  async withdraw(
    amount: string,
    to: string,
    sender: string,
  ): Promise<BridgeTxResult> {
    this.ensureInitialized();
    const txHash = this.pushTx("withdraw", amount, { sender, to });
    return { txHash };
  }

  async rollover(sender: string): Promise<BridgeTxResult> {
    this.ensureInitialized();
    const txHash = this.pushTx("rollover", "0", { sender });
    return { txHash };
  }

  async prepareFund(amount: string, sender: string): Promise<BridgePrepareResult> {
    this.ensureInitialized();
    return {
      calls: [
        {
          contractAddress: "0xmock_tongo",
          entrypoint: "fund",
          calldata: [amount, sender],
        },
      ],
    };
  }

  async prepareTransfer(
    amount: string,
    recipientBase58: string,
    sender: string,
  ): Promise<BridgePrepareResult> {
    this.ensureInitialized();
    return {
      calls: [
        {
          contractAddress: "0xmock_tongo",
          entrypoint: "transfer",
          calldata: [amount, recipientBase58, sender],
        },
      ],
    };
  }

  async prepareWithdraw(
    amount: string,
    to: string,
    sender: string,
  ): Promise<BridgePrepareResult> {
    this.ensureInitialized();
    return {
      calls: [
        {
          contractAddress: "0xmock_tongo",
          entrypoint: "withdraw",
          calldata: [amount, to, sender],
        },
      ],
    };
  }

  async prepareRollover(sender: string): Promise<BridgePrepareResult> {
    this.ensureInitialized();
    return {
      calls: [
        {
          contractAddress: "0xmock_tongo",
          entrypoint: "rollover",
          calldata: [sender],
        },
      ],
    };
  }

  async switchToken(_tongoPrivateKey: string, token: string): Promise<{ success: boolean }> {
    this.ensureInitialized();
    this.selectedToken = token;
    return { success: true };
  }

  async generateKeypair(): Promise<BridgeKeypair> {
    const id = `${Date.now()}_${this.txCounter + 1}`;
    const privateKey = this.toDeterministicHex(`priv_${id}`, 64);
    const publicKey = this.toDeterministicHex(`pub_${id}`, 64);
    return { privateKey, publicKey };
  }

  async derivePublicKey(privateKey: string): Promise<BridgePublicKey> {
    const sanitized = privateKey.replace(/^0x/i, "").padStart(64, "0").slice(-64);
    return {
      x: `0x${sanitized}`,
      y: this.toDeterministicHex(`y_${privateKey}`, 64),
    };
  }

  async queryERC20Balance(token: string, _address: string): Promise<string> {
    return this.erc20BalancesByToken[token] ?? "0";
  }

  async getTxHistory(fromBlock = 0): Promise<any[]> {
    const startIndex = Number.isFinite(fromBlock) && fromBlock > 0 ? fromBlock : 0;
    return clone(this.txHistory.slice(startIndex));
  }

  async validateBase58(base58: string): Promise<boolean> {
    if (!BASE58_REGEX.test(base58)) return false;
    return this.validBase58.has(base58) || base58.length >= 20;
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("Tongo mock bridge not initialized");
    }
  }

  private getTokenState(token: string): TongoState {
    if (!this.stateByToken[token]) {
      this.stateByToken[token] = { balance: "0", pending: "0", nonce: "0" };
    }
    return this.stateByToken[token];
  }

  private pushTx(action: string, amount: string, extra: Record<string, any>): string {
    this.txCounter += 1;
    const txHash = this.toDeterministicHex(`tx_${this.txCounter}`, 64);
    this.txHistory.unshift({
      txHash,
      action,
      token: this.selectedToken,
      amount,
      created_at: new Date().toISOString(),
      ...extra,
    });

    const tokenState = this.getTokenState(this.selectedToken);
    tokenState.nonce = (BigInt(tokenState.nonce || "0") + 1n).toString();

    return txHash;
  }

  private toDeterministicHex(seed: string, hexLen: number): string {
    let out = "";
    for (let i = 0; out.length < hexLen; i += 1) {
      const charCode = seed.charCodeAt(i % seed.length);
      const mixed = (charCode + i * 17 + seed.length * 31) & 0xff;
      out += mixed.toString(16).padStart(2, "0");
    }
    return `0x${out.slice(0, hexLen)}`;
  }
}

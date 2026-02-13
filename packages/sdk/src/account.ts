import { Account as TongoAccount, pubKeyBase58ToAffine } from "@fatsolutions/tongo-sdk";
import {
  Account,
  ec,
  hash,
  num,
  transaction,
  type Call,
  type RpcProvider,
  type SignerInterface,
  type InvocationsSignerDetails,
  type DeclareSignerDetails,
  type DeployAccountSignerDetails,
  type TypedData,
} from "starknet";
import type { Account as StarkAccount } from "starknet";
import { padAddress } from "./address";
import { TOKENS, formatTokenAmount, parseTokenAmount } from "./tokens";
import { TransactionFailedError } from "./errors";
import type { TokenKey, ShieldedState } from "./types";

/**
 * Custom signer that returns a pre-computed combined signature.
 * Used by executeWithDualSignature to submit dual-signed transactions.
 */
class DualSignSigner implements SignerInterface {
  constructor(private sig: string[]) {}

  async getPubKey(): Promise<string> {
    return "0x0";
  }

  async signMessage(
    _typedData: TypedData,
    _accountAddress: string,
  ): Promise<string[]> {
    return this.sig;
  }

  async signTransaction(
    _transactions: Call[],
    _details: InvocationsSignerDetails,
  ): Promise<string[]> {
    return this.sig;
  }

  async signDeclareTransaction(
    _details: DeclareSignerDetails,
  ): Promise<string[]> {
    return this.sig;
  }

  async signDeployAccountTransaction(
    _details: DeployAccountSignerDetails,
  ): Promise<string[]> {
    return this.sig;
  }
}

export class CloakAccount {
  private tongoAccount: TongoAccount;
  private starkAccount: StarkAccount;
  private tokenKey: TokenKey;
  private _privateKey: string | null;

  constructor(
    tongoAccount: TongoAccount,
    starkAccount: StarkAccount,
    tokenKey: TokenKey,
    privateKey?: string,
  ) {
    this.tongoAccount = tongoAccount;
    this.starkAccount = starkAccount;
    this.tokenKey = tokenKey;
    this._privateKey = privateKey ?? null;
  }

  private get token() {
    return TOKENS[this.tokenKey];
  }

  private get senderAddress(): string {
    return padAddress(this.starkAccount.address);
  }

  /** Fetch a fresh nonce from the network to avoid conflicts. */
  private async freshNonce(): Promise<string> {
    const nonce = await this.starkAccount.getNonce();
    return nonce.toString();
  }

  // ─── Read-only queries ─────────────────────────────────────────────

  async getState(): Promise<ShieldedState> {
    const state = await this.tongoAccount.state();
    return {
      balance: BigInt(state.balance),
      pending: BigInt(state.pending),
      nonce: BigInt(state.nonce),
    };
  }

  async getErc20Balance(): Promise<bigint> {
    const provider = this.starkAccount.channel as unknown as RpcProvider;
    const result = await provider.callContract({
      contractAddress: this.token.erc20Address,
      entrypoint: "balanceOf",
      calldata: [this.senderAddress],
    });
    return BigInt(result[0]);
  }

  async getRate(): Promise<bigint> {
    return this.token.rate;
  }

  async getTxHistory(fromBlock: number = 0): Promise<any[]> {
    const history = await (this.tongoAccount as any).getTxHistory(fromBlock);
    return (history || []).map((event: any) => ({
      ...event,
      amount: event.amount?.toString(),
      nonce: event.nonce?.toString(),
    }));
  }

  // ─── Execute methods (prepare + sign + submit) ────────────────────

  async fund(amount: bigint): Promise<{ txHash: string }> {
    const { calls } = await this.prepareFund(amount);
    return this.executeTransaction(calls);
  }

  async transfer(to: string, amount: bigint): Promise<{ txHash: string }> {
    const { calls } = await this.prepareTransfer(to, amount);
    return this.executeTransaction(calls);
  }

  async withdraw(amount: bigint): Promise<{ txHash: string }> {
    const { calls } = await this.prepareWithdraw(amount);
    return this.executeTransaction(calls);
  }

  async rollover(): Promise<{ txHash: string }> {
    const { calls } = await this.prepareRollover();
    return this.executeTransaction(calls);
  }

  // ─── Prepare methods (return Call[] without executing) ────────────

  async prepareFund(amount: bigint): Promise<{ calls: Call[] }> {
    const fundOp = await this.tongoAccount.fund({
      amount,
      sender: this.senderAddress,
    });

    const calls: Call[] = [];
    if (fundOp.approve) {
      calls.push(fundOp.approve as Call);
    }
    calls.push(fundOp.toCalldata() as Call);
    return { calls };
  }

  async prepareTransfer(to: string, amount: bigint): Promise<{ calls: Call[] }> {
    const recipientPubKey = pubKeyBase58ToAffine(to);

    const transferOp = await this.tongoAccount.transfer({
      amount,
      to: recipientPubKey,
      sender: this.senderAddress,
    });

    return { calls: [transferOp.toCalldata() as Call] };
  }

  async prepareWithdraw(amount: bigint): Promise<{ calls: Call[] }> {
    const withdrawOp = await this.tongoAccount.withdraw({
      amount,
      to: this.senderAddress,
      sender: this.senderAddress,
    });

    return { calls: [withdrawOp.toCalldata() as Call] };
  }

  async prepareRollover(): Promise<{ calls: Call[] }> {
    const rolloverOp = await this.tongoAccount.rollover({
      sender: this.senderAddress,
    });

    return { calls: [rolloverOp.toCalldata() as Call] };
  }

  // ─── Conversions ──────────────────────────────────────────────────

  async erc20ToTongo(erc20Amount: bigint): Promise<bigint> {
    return erc20Amount / this.token.rate;
  }

  async tongoToErc20(tongoAmount: bigint): Promise<bigint> {
    return tongoAmount * this.token.rate;
  }

  formatAmount(tongoUnits: bigint): string {
    const erc20Amount = tongoUnits * this.token.rate;
    return formatTokenAmount(erc20Amount, this.token.decimals);
  }

  parseAmount(displayAmount: string): bigint {
    const erc20Amount = parseTokenAmount(displayAmount, this.token.decimals);
    return erc20Amount / this.token.rate;
  }

  // ─── Multi-sig / 2FA ─────────────────────────────────────────────

  /**
   * Prepare a transaction and sign with key 1 only (does NOT submit).
   * Used by web/extension to create a partial signature for 2FA approval.
   *
   * Computes the V3 invoke transaction hash, signs it, and returns all
   * data needed for the mobile to co-sign and submit.
   */
  async prepareAndSign(
    calls: Call[],
    privateKey?: string,
  ): Promise<{
    calls: Call[];
    txHash: string;
    sig1: [string, string];
    nonce: string;
    resourceBoundsJson: string;
  }> {
    const pk = privateKey ?? this._privateKey;
    if (!pk) throw new Error("Private key required for prepareAndSign");

    const nonce = await this.freshNonce();
    const chainId = await this.starkAccount.getChainId();

    // Estimate fee to get resource bounds
    const feeEstimate = await this.starkAccount.estimateInvokeFee(calls, { nonce });
    const resourceBounds = feeEstimate.resourceBounds;

    // Compute compiled calldata
    const compiledCalldata = transaction.getExecuteCalldata(calls, "1");

    // Compute V3 invoke transaction hash
    const txHash = hash.calculateInvokeTransactionHash({
      senderAddress: this.senderAddress,
      version: "0x3" as any,
      compiledCalldata,
      chainId: chainId as any,
      nonce,
      accountDeploymentData: [],
      nonceDataAvailabilityMode: 0 as any,
      feeDataAvailabilityMode: 0 as any,
      resourceBounds,
      tip: 0,
      paymasterData: [],
    });
    const txHashHex = num.toHex(txHash);

    // Sign with key 1
    const sig = ec.starkCurve.sign(txHashHex, pk);
    const sig1: [string, string] = [
      "0x" + sig.r.toString(16),
      "0x" + sig.s.toString(16),
    ];

    return {
      calls,
      txHash: txHashHex,
      sig1,
      nonce,
      resourceBoundsJson: JSON.stringify(resourceBounds, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    };
  }

  /**
   * Submit a transaction with a combined dual signature [r1,s1,r2,s2].
   * Used by mobile after getting sig1 from Supabase and signing with key 2.
   */
  async executeWithDualSignature(
    calls: Call[],
    sig1: [string, string],
    sig2: [string, string],
    nonce: string,
    resourceBoundsJson: string,
  ): Promise<{ txHash: string }> {
    try {
      const combined = [...sig1, ...sig2];

      // Parse resource bounds (bigints were serialized as strings)
      const resourceBounds = JSON.parse(resourceBoundsJson, (_k, v) => {
        if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
        return v;
      });

      // Create a temporary Account with a signer that returns the dual signature
      const dualSigner = new DualSignSigner(combined);
      const provider = (this.starkAccount as any).channel ?? (this.starkAccount as any).provider;

      const dualAccount = new Account({
        provider,
        address: this.starkAccount.address,
        signer: dualSigner,
      });

      const tx = await dualAccount.execute(calls, { nonce, resourceBounds });
      return { txHash: tx.transaction_hash };
    } catch (err: any) {
      throw new TransactionFailedError(err?.message || "Dual-sig transaction failed");
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private async executeTransaction(calls: Call[]): Promise<{ txHash: string }> {
    try {
      const nonce = await this.freshNonce();
      const tx = await this.starkAccount.execute(calls, { nonce });
      return { txHash: tx.transaction_hash };
    } catch (err: any) {
      throw new TransactionFailedError(err?.message || "Transaction failed");
    }
  }
}

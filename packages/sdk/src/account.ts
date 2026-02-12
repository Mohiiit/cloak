import { Account as TongoAccount, pubKeyBase58ToAffine } from "@fatsolutions/tongo-sdk";
import type { Account as StarkAccount, Call, RpcProvider } from "starknet";
import { padAddress } from "./address";
import { TOKENS, formatTokenAmount, parseTokenAmount } from "./tokens";
import { TransactionFailedError } from "./errors";
import type { TokenKey, ShieldedState } from "./types";

export class CloakAccount {
  private tongoAccount: TongoAccount;
  private starkAccount: StarkAccount;
  private tokenKey: TokenKey;

  constructor(
    tongoAccount: TongoAccount,
    starkAccount: StarkAccount,
    tokenKey: TokenKey,
  ) {
    this.tongoAccount = tongoAccount;
    this.starkAccount = starkAccount;
    this.tokenKey = tokenKey;
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

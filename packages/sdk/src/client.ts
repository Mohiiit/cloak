import { RpcProvider, Account, type Call } from "starknet";
import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
import { CloakAccount } from "./account";
import { generateKey, isValidKey, assertValidKey } from "./keys";
import { padAddress } from "./address";
import { TOKENS } from "./tokens";
import { createWalletInfo, computeAddress, buildDeployAccountPayload, OZ_ACCOUNT_CLASS_HASH } from "./wallet";
import { MemoryStorage } from "./storage/memory";
import { WalletNotFoundError, InvalidKeyError } from "./errors";
import type { CloakClientConfig, StorageAdapter, TokenKey, WalletInfo, Network } from "./types";

const STORAGE_KEY_PK = "private_key";
const STORAGE_KEY_ADDRESS = "stark_address";

const DEFAULT_RPC: Record<Network, string> = {
  sepolia: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8",
  mainnet: "https://starknet-mainnet.public.blastapi.io/rpc/v0_9",
};

export class CloakClient {
  private provider: RpcProvider;
  private storage: StorageAdapter;
  private network: Network;
  private _starkAccount: Account | null = null;
  private _accountCache = new Map<TokenKey, CloakAccount>();

  constructor(config: CloakClientConfig) {
    this.network = config.network;
    this.storage = config.storage ?? new MemoryStorage();
    this.provider = new RpcProvider({
      nodeUrl: config.rpcUrl ?? DEFAULT_RPC[config.network],
    });
  }

  // ─── Wallet management ────────────────────────────────────────────

  async createWallet(): Promise<WalletInfo> {
    const info = createWalletInfo();
    await this.storage.set(STORAGE_KEY_PK, info.privateKey);
    await this.storage.set(STORAGE_KEY_ADDRESS, info.starkAddress);
    this._starkAccount = null;
    this._accountCache.clear();

    // Derive Tongo address
    info.tongoAddress = this.deriveTongoAddress(info.privateKey);
    return info;
  }

  async importWallet(privateKey: string, address?: string): Promise<WalletInfo> {
    assertValidKey(privateKey);

    const info = createWalletInfo(privateKey);
    if (address) {
      info.starkAddress = padAddress(address);
    }

    await this.storage.set(STORAGE_KEY_PK, info.privateKey);
    await this.storage.set(STORAGE_KEY_ADDRESS, info.starkAddress);
    this._starkAccount = null;
    this._accountCache.clear();

    info.tongoAddress = this.deriveTongoAddress(info.privateKey);
    return info;
  }

  async hasWallet(): Promise<boolean> {
    const pk = await this.storage.get(STORAGE_KEY_PK);
    return pk !== null && isValidKey(pk);
  }

  async getWallet(): Promise<WalletInfo | null> {
    const pk = await this.storage.get(STORAGE_KEY_PK);
    if (!pk || !isValidKey(pk)) return null;

    const info = createWalletInfo(pk);
    const storedAddress = await this.storage.get(STORAGE_KEY_ADDRESS);
    if (storedAddress) {
      info.starkAddress = storedAddress;
    }
    info.tongoAddress = this.deriveTongoAddress(pk);
    return info;
  }

  async clearWallet(): Promise<void> {
    await this.storage.remove(STORAGE_KEY_PK);
    await this.storage.remove(STORAGE_KEY_ADDRESS);
    this._starkAccount = null;
    this._accountCache.clear();
  }

  async deployAccount(): Promise<string> {
    const wallet = await this.getWallet();
    if (!wallet) throw new WalletNotFoundError();

    const payload = buildDeployAccountPayload(wallet.publicKey);

    const account = new Account({
      provider: this.provider,
      address: payload.contractAddress,
      signer: wallet.privateKey,
    });

    const { transaction_hash } = await account.deployAccount({
      classHash: payload.classHash,
      constructorCalldata: payload.constructorCalldata,
      addressSalt: payload.addressSalt,
    });

    return transaction_hash;
  }

  async isDeployed(): Promise<boolean> {
    const wallet = await this.getWallet();
    if (!wallet) return false;

    try {
      const nonce = await this.provider.getNonceForAddress(wallet.starkAddress);
      return true; // If getNonce doesn't throw, the account exists
    } catch {
      return false;
    }
  }

  // ─── Tongo address ────────────────────────────────────────────────

  getTongoAddress(): string {
    // Synchronous — requires wallet to have been loaded
    // Use getWallet() first if you need async
    return this._tongoAddress ?? "";
  }

  private _tongoAddress: string | null = null;

  private deriveTongoAddress(privateKey: string): string {
    // Create a temporary TongoAccount with STRK contract to derive address
    const tokenConfig = TOKENS.STRK;
    const tAccount = new TongoAccount(
      privateKey,
      padAddress(tokenConfig.tongoContract),
      this.provider as any,
    );
    const addr = tAccount.tongoAddress();
    this._tongoAddress = addr;
    return addr;
  }

  // ─── Per-token account access ─────────────────────────────────────

  account(token: TokenKey): CloakAccount {
    const cached = this._accountCache.get(token);
    if (cached) return cached;

    // This is synchronous — wallet must be loaded via loadStarkAccount first
    const acct = this.createCloakAccount(token);
    this._accountCache.set(token, acct);
    return acct;
  }

  /**
   * Initialize the internal Starknet Account. Must be called after create/import wallet.
   * Automatically called by account() if needed.
   */
  private createCloakAccount(token: TokenKey): CloakAccount {
    if (!this._starkAccount) {
      // Lazy load — get from storage synchronously won't work, so we throw
      throw new WalletNotFoundError();
    }

    const tokenConfig = TOKENS[token];
    const pk = (this._starkAccount as any).signer?.pk;
    // We need the private key to create TongoAccount
    // Store it when we init the stark account
    const privateKey = this._privateKey!;

    const tongoAccount = new TongoAccount(
      privateKey,
      padAddress(tokenConfig.tongoContract),
      this.provider as any,
    );

    return new CloakAccount(tongoAccount, this._starkAccount, token);
  }

  private _privateKey: string | null = null;

  /**
   * Initialize the client for use. Must be called after createWallet/importWallet
   * or at startup if wallet exists in storage.
   */
  async init(): Promise<boolean> {
    const pk = await this.storage.get(STORAGE_KEY_PK);
    if (!pk || !isValidKey(pk)) return false;

    const address = await this.storage.get(STORAGE_KEY_ADDRESS);
    if (!address) return false;

    this._privateKey = pk;
    this._starkAccount = new Account({
      provider: this.provider,
      address,
      signer: pk,
    });
    this.deriveTongoAddress(pk);
    this._accountCache.clear();
    return true;
  }

  // ─── Static utilities ─────────────────────────────────────────────

  static generateKey = generateKey;
  static isValidKey = isValidKey;
  static computeAddress = computeAddress;
}

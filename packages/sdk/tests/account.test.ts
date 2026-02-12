import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryStorage } from "../src/storage/memory";
import { isValidKey } from "../src/keys";
import { padAddress } from "../src/address";

// Mock tongo-sdk to avoid its internal module resolution issues
vi.mock("@fatsolutions/tongo-sdk", () => ({
  Account: class MockTongoAccount {
    constructor(pk: string, contract: string, provider: any) {}
    tongoAddress() { return "MockTongoBase58Address"; }
    async state() { return { balance: "100", pending: "50", nonce: "3" }; }
    async fund(params: any) {
      return {
        approve: { contractAddress: "0x1", entrypoint: "approve", calldata: [] },
        toCalldata: () => ({ contractAddress: "0x2", entrypoint: "fund", calldata: [] }),
      };
    }
    async transfer(params: any) {
      return {
        toCalldata: () => ({ contractAddress: "0x2", entrypoint: "transfer", calldata: [] }),
      };
    }
    async withdraw(params: any) {
      return {
        toCalldata: () => ({ contractAddress: "0x2", entrypoint: "withdraw", calldata: [] }),
      };
    }
    async rollover(params: any) {
      return {
        toCalldata: () => ({ contractAddress: "0x2", entrypoint: "rollover", calldata: [] }),
      };
    }
  },
  pubKeyBase58ToAffine: (addr: string) => ({ x: 1n, y: 2n }),
  derivePublicKey: (pk: bigint) => ({ x: 1n, y: 2n }),
  pubKeyAffineToBase58: (pk: any) => "MockBase58",
}));

// Must import after mock
const { CloakClient } = await import("../src/client");

describe("CloakClient", () => {
  it("creates a wallet with valid keys", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    const wallet = await client.createWallet();
    expect(isValidKey(wallet.privateKey)).toBe(true);
    expect(wallet.publicKey).toMatch(/^0x[0-9a-f]+$/);
    expect(wallet.starkAddress).toMatch(/^0x[0-9a-f]{64}$/);
    expect(wallet.tongoAddress.length).toBeGreaterThan(0);
  });

  it("hasWallet returns true after creating", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    expect(await client.hasWallet()).toBe(false);
    await client.createWallet();
    expect(await client.hasWallet()).toBe(true);
  });

  it("getWallet returns stored wallet", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    const created = await client.createWallet();
    const retrieved = await client.getWallet();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.privateKey).toBe(created.privateKey);
    expect(retrieved!.starkAddress).toBe(created.starkAddress);
  });

  it("clearWallet removes wallet", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    await client.createWallet();
    await client.clearWallet();
    expect(await client.hasWallet()).toBe(false);
    expect(await client.getWallet()).toBeNull();
  });

  it("importWallet with valid key", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    const key = CloakClient.generateKey();
    const wallet = await client.importWallet(key);
    expect(wallet.privateKey).toBe(key);
    expect(wallet.starkAddress.length).toBe(66);
  });

  it("importWallet with custom address", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    const key = CloakClient.generateKey();
    const customAddr = "0x1234";
    const wallet = await client.importWallet(key, customAddr);
    expect(wallet.starkAddress).toBe(padAddress(customAddr));
  });

  it("importWallet rejects invalid key", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    await expect(client.importWallet("0x0")).rejects.toThrow("Invalid");
    await expect(client.importWallet("not-a-key")).rejects.toThrow();
  });

  it("static utilities work", () => {
    const key = CloakClient.generateKey();
    expect(CloakClient.isValidKey(key)).toBe(true);
    expect(CloakClient.isValidKey("0x0")).toBe(false);

    const address = CloakClient.computeAddress("0x1");
    expect(address).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("init loads wallet from storage", async () => {
    const storage = new MemoryStorage();
    const client1 = new CloakClient({ network: "sepolia", storage });

    const wallet = await client1.createWallet();

    const client2 = new CloakClient({ network: "sepolia", storage });
    const loaded = await client2.init();
    expect(loaded).toBe(true);

    const retrieved = await client2.getWallet();
    expect(retrieved!.privateKey).toBe(wallet.privateKey);
  });

  it("account() throws if no wallet loaded", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    expect(() => client.account("STRK")).toThrow("No wallet found");
  });

  it("account() works after init", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    await client.createWallet();
    await client.init();

    const acct = client.account("STRK");
    expect(acct).toBeDefined();

    // Same instance for same token
    const acct2 = client.account("STRK");
    expect(acct2).toBe(acct);

    // Different token, different instance
    const ethAcct = client.account("ETH");
    expect(ethAcct).not.toBe(acct);
  });

  it("CloakAccount.getState() works", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    await client.createWallet();
    await client.init();

    const acct = client.account("STRK");
    const state = await acct.getState();
    expect(state.balance).toBe(100n);
    expect(state.pending).toBe(50n);
    expect(state.nonce).toBe(3n);
  });

  it("CloakAccount.prepareFund() returns calls", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    await client.createWallet();
    await client.init();

    const acct = client.account("STRK");
    const { calls } = await acct.prepareFund(1n);
    // Should have approve + fund call
    expect(calls.length).toBe(2);
  });

  it("CloakAccount.prepareTransfer() returns calls", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    await client.createWallet();
    await client.init();

    const acct = client.account("STRK");
    const { calls } = await acct.prepareTransfer("SomeBase58Address", 1n);
    expect(calls.length).toBe(1);
  });

  it("CloakAccount conversion methods", async () => {
    const client = new CloakClient({
      network: "sepolia",
      storage: new MemoryStorage(),
    });

    await client.createWallet();
    await client.init();

    const acct = client.account("STRK");
    // STRK rate = 50000000000000000n
    const erc20 = await acct.tongoToErc20(2n);
    expect(erc20).toBe(100000000000000000n); // 0.1 STRK

    const tongo = await acct.erc20ToTongo(100000000000000000n);
    expect(tongo).toBe(2n);

    const formatted = acct.formatAmount(20n); // 20 * 0.05 = 1.0 STRK
    expect(formatted).toBe("1");
  });
});
